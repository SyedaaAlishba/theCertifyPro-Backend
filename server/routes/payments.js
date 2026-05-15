const express  = require('express');
const crypto   = require('crypto');
const mongoose = require('mongoose');

const Payment             = require('../models/Payment');
const User                = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger              = require('../utils/logger');
const validate            = require('../utils/validation');

const router = express.Router();

// ── User endpoints ────────────────────────────────────────────────────────────

// GET /api/payments/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    if (req.user.plan === 'pro') return res.json({ status: 'approved' });

    // Use compound index (userId + status) — single query, project only status
    const latest = await Payment.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('status')
      .lean();

    if (!latest)                          return res.json({ status: 'none' });
    if (latest.status === 'Pending')      return res.json({ status: 'pending' });
    if (latest.status === 'Approved')     return res.json({ status: 'approved' });
    res.json({ status: 'none' });
  } catch (err) {
    logger.error('Fetch payment status failed', { userId: req.user.id, error: err.message });
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// GET /api/payments/generate-id
router.get('/generate-id', requireAuth, async (req, res) => {
  try {
    let paymentId = '';
    let attempts  = 0;

    while (attempts < 10) {
      const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
      paymentId        = `PAY-${randomPart}`;
      const existing   = await Payment.exists({ paymentId });
      if (!existing) break;
      attempts++;
    }

    if (attempts === 10) return res.status(500).json({ error: 'Could not generate unique ID' });
    res.json({ paymentId });
  } catch (err) {
    logger.error('Generate payment ID failed', { error: err.message });
    res.status(500).json({ error: 'Failed to generate ID' });
  }
});

// POST /api/payments - Submit payment
router.post('/', requireAuth, async (req, res) => {
  try {
    const { planType, paymentId, screenshot, trxnId, note } = req.body;
    if (!planType || !screenshot || !paymentId) {
      return res.status(400).json({ error: 'Plan, Payment ID, and screenshot are required' });
    }

    const cleanPaymentId = validate.sanitize(paymentId);
    const cleanTrxnId    = validate.sanitize(trxnId  || '');
    const cleanNote      = validate.sanitize(note     || '');

    if (planType === 'pkr' && (!cleanTrxnId || cleanTrxnId.length < 8)) {
      return res.status(400).json({ error: 'Transaction ID must be at least 8 characters for PKR payments' });
    }

    // Single query using compound index (userId + status = Pending)
    const pending = await Payment.exists({ userId: req.user.id, status: 'Pending' });
    if (pending) return res.status(400).json({ error: 'You already have a pending payment' });

    const existingId = await Payment.exists({ paymentId: cleanPaymentId });
    if (existingId) return res.status(400).json({ error: 'Payment ID not unique or already taken' });

    const id = crypto.randomBytes(16).toString('hex').slice(0, 16);
    await Payment.create({
      id,
      userId:    req.user.id,
      planType,
      paymentId: cleanPaymentId,
      screenshot,
      trxnId:    cleanTrxnId || null,
      note:      cleanNote   || null,
    });

    logger.info('Payment submitted', { userId: req.user.id, paymentId: cleanPaymentId });
    res.json({ message: 'Payment submitted successfully', id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Payment ID already exists' });
    }
    logger.error('Submit payment failed', { userId: req.user.id, error: err.message });
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

// GET /api/payments/all
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .lean();

    const result = payments.map(p => ({
      ...p,
      user_name:  p.userId?.name  || '',
      user_email: p.userId?.email || '',
      user_id:    p.userId?._id?.toString(),
      payment_id: p.paymentId,
      plan_type:  p.planType,
      trxn_id:    p.trxnId,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }));

    res.json({ payments: result });
  } catch (err) {
    logger.error('List payments error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST /api/payments/approve — wrapped in MongoDB transaction
router.post('/approve', requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

    const payment = await Payment.findOne({
      $or: [{ id: paymentId }, { paymentId }],
    }).lean();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'Approved') return res.status(400).json({ error: 'Already approved' });

    session.startTransaction();

    await Payment.findByIdAndUpdate(
      payment._id,
      { $set: { status: 'Approved' } },
      { session }
    );
    await User.findByIdAndUpdate(
      payment.userId,
      { $set: { plan: 'pro' } },
      { session }
    );

    await session.commitTransaction();
    logger.info('Payment approved', { paymentId, userId: payment.userId });
    res.json({ message: 'Payment approved and user upgraded.' });
  } catch (err) {
    await session.abortTransaction();
    logger.error('Approve payment error', { error: err.message });
    res.status(500).json({ error: 'Failed to approve payment' });
  } finally {
    session.endSession();
  }
});

// POST /api/payments/reject
router.post('/reject', requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

    const payment = await Payment.findOne({
      $or: [{ id: paymentId }, { paymentId }],
    }).lean();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'Rejected') return res.status(400).json({ error: 'Already rejected' });

    await Payment.findByIdAndUpdate(payment._id, { $set: { status: 'Rejected' } });
    logger.info('Payment rejected', { paymentId });
    res.json({ message: 'Payment rejected.' });
  } catch (err) {
    logger.error('Reject payment error', { error: err.message });
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

module.exports = router;
