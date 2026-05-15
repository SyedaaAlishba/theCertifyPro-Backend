const express          = require('express');
const mongoose         = require('mongoose');
const Certificate      = require('../models/Certificate');
const { requireAuth }  = require('../middleware/auth');
const { toObjectId }   = require('../utils/objectId');
const validate         = require('../utils/validation');
const logger           = require('../utils/logger');


const router = express.Router();

// All certificate routes require auth
router.use(requireAuth);

// ── GET /api/certificates ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const limitVal  = parseInt(req.query.limit)  || 100;
    const offsetVal = parseInt(req.query.offset) || 0;

    const searchRegex = search ? new RegExp(search, 'i') : null;
    const query = { userId: req.user.id };
    if (searchRegex) {
      query.$or = [
        { recipientName: searchRegex },
        { courseTitle:   searchRegex },
        { id:            searchRegex },
      ];
    }

    const [certs, total] = await Promise.all([
      Certificate.find(query)
        .sort({ createdAt: -1 })
        .skip(offsetVal)
        .limit(limitVal)
        .lean(),
      Certificate.countDocuments(query),
    ]);

    // Normalise field names to snake_case for client compatibility
    const normalised = certs.map(normCert);
    res.json({ certificates: normalised, total });
  } catch (err) {
    console.error('Get certs error:', err);
    res.status(500).json({
      error: 'Failed to fetch certificates',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// ── GET /api/certificates/stats ───────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const uid = req.user.id;

    const now       = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [total, thisMonth, themesUsed, verAgg, monthly] = await Promise.all([
      Certificate.countDocuments({ userId: uid }),
      Certificate.countDocuments({ userId: uid, createdAt: { $gte: startOfMonth } }),
      Certificate.distinct('themeIdx', { userId: uid }).then(a => a.length),
      Certificate.aggregate([
        { $match: { userId: toObjectId(uid) } },
        { $group: { _id: null, total: { $sum: '$verifiedCount' } } },
      ]),
      Certificate.aggregate([
        {
          $match: {
            userId:    toObjectId(uid),
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              year:  { $year:  '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const verifications = verAgg.length ? verAgg[0].total : 0;
    const monthlyData   = monthly.map(m => ({
      month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      count: m.count,
    }));

    res.json({ total, thisMonth, themesUsed, verifications, monthly: monthlyData });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({
      error: 'Failed to fetch stats',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// ── GET /api/certificates/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const cert = await Certificate.findOne({ id: req.params.id, userId: req.user.id }).lean();
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ certificate: normCert(cert) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// ── POST /api/certificates ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    let {
      id, recipientName, courseTitle, organization = '',
      instructor = '', date = '', themeIdx = 0, logoUrl = null, sigUrl = null,
    } = req.body;

    if (!id || !recipientName || !courseTitle)
      return res.status(400).json({ error: 'id, recipientName and courseTitle are required' });

    recipientName = validate.sanitize(recipientName);
    courseTitle   = validate.sanitize(courseTitle);
    organization  = validate.sanitize(organization);
    instructor    = validate.sanitize(instructor);
    date          = validate.sanitize(date);

    const exists = await Certificate.findOne({ id: id.toUpperCase() });
    if (exists) return res.status(409).json({ error: 'Certificate ID already exists' });

    const cert = await Certificate.create({
      id: id.toUpperCase(),
      userId:        req.user.id,
      recipientName,
      courseTitle,
      organization,
      instructor,
      date,
      themeIdx,
      logoUrl,
      sigUrl,
    });

    logger.info('Certificate created', { certId: id, userId: req.user.id });
    res.status(201).json({ certificate: normCert(cert.toObject()) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Certificate ID already exists' });
    }
    logger.error('Create cert error', { userId: req.user.id, error: err.message });
    res.status(500).json({ error: 'Failed to create certificate' });
  }
});

// ── POST /api/certificates/bulk ───────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
  try {
    const { certificates } = req.body;
    if (!Array.isArray(certificates) || certificates.length === 0)
      return res.status(400).json({ error: 'certificates array is required' });

    if (req.user.plan !== 'pro')
      return res.status(403).json({ error: 'Bulk generation requires Pro plan' });

    const docs = certificates
      .filter(c => c.id && c.recipientName && c.courseTitle)
      .map(c => ({
        id:            c.id.toUpperCase(),
        userId:        req.user.id,
        recipientName: c.recipientName,
        courseTitle:   c.courseTitle,
        organization:  c.organization  || '',
        instructor:    c.instructor    || '',
        date:          c.date          || '',
        themeIdx:      c.themeIdx      || 0,
        logoUrl:       c.logoUrl       || null,
        sigUrl:        c.sigUrl        || null,
      }));

    // ordered: false → skip duplicates, don't abort entire batch
    const result = await Certificate.insertMany(docs, { ordered: false }).catch(err => {
      if (err.code === 11000 && err.insertedDocs) return { insertedCount: err.insertedDocs.length };
      if (err.code === 11000) return { insertedCount: 0 };
      throw err;
    });

    const created = result.insertedCount ?? result.length ?? 0;
    res.status(201).json({ created, message: `${created} certificates generated` });
  } catch (err) {
    console.error('Bulk cert error:', err);
    res.status(500).json({
      error: 'Bulk generation failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// ── PUT /api/certificates/:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const cert = await Certificate.findOne({ id: req.params.id, userId: req.user.id });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const { recipientName, courseTitle, organization, instructor, date, themeIdx, logoUrl, sigUrl } = req.body;

    const updates = {};
    if (recipientName !== undefined) updates.recipientName = recipientName;
    if (courseTitle   !== undefined) updates.courseTitle   = courseTitle;
    if (organization  !== undefined) updates.organization  = organization;
    if (instructor    !== undefined) updates.instructor    = instructor;
    if (date          !== undefined) updates.date          = date;
    if (themeIdx      !== undefined) updates.themeIdx      = themeIdx;
    if (logoUrl       !== undefined) updates.logoUrl       = logoUrl;
    if (sigUrl        !== undefined) updates.sigUrl        = sigUrl;

    const updated = await Certificate.findOneAndUpdate(
      { id: req.params.id },
      { $set: updates },
      { new: true }
    ).lean();

    res.json({ certificate: normCert(updated) });
  } catch (err) {
    console.error('Update cert error:', err);
    res.status(500).json({ error: 'Failed to update certificate' });
  }
});

// ── DELETE /api/certificates/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await Certificate.deleteOne({ id: req.params.id, userId: req.user.id });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Certificate not found' });
    res.json({ message: 'Certificate deleted' });
  } catch (err) {
    console.error('Delete cert error:', err);
    res.status(500).json({ error: 'Failed to delete certificate' });
  }
});

// ── Normalise camelCase Mongoose doc → snake_case for client ──────────────────
function normCert(c) {
  return {
    id:             c.id,
    user_id:        c.userId?.toString(),
    recipient_name: c.recipientName,
    course_title:   c.courseTitle,
    organization:   c.organization,
    instructor:     c.instructor,
    date:           c.date,
    theme_idx:      c.themeIdx,
    logo_url:       c.logoUrl,
    sig_url:        c.sigUrl,
    verified_count: c.verifiedCount,
    created_at:     c.createdAt,
    updated_at:     c.updatedAt,
  };
}

module.exports = router;
