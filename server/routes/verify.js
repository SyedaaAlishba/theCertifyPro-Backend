const express       = require('express');
const Certificate    = require('../models/Certificate');
const Verification   = require('../models/Verification');
const logger         = require('../utils/logger');

const router = express.Router();

// ── GET /api/verify/:certId ───────────────────────────────────────────────────
// Public endpoint — no auth required
router.get('/:certId', async (req, res) => {
  try {
    const certId = req.params.certId.toUpperCase();

    const cert = await Certificate.findOne({ id: certId })
      .populate('userId', 'name org')
      .lean();

    if (!cert) {
      return res.status(404).json({
        valid: false,
        error: 'Certificate not found. This ID may be invalid or the certificate may have been deleted.',
      });
    }

    // Log the verification
    await Verification.create({
      certId,
      ip:        req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    // Increment verified count
    await Certificate.findOneAndUpdate({ id: certId }, { $inc: { verifiedCount: 1 } });

    res.json({
      valid: true,
      certificate: {
        id:             cert.id,
        recipient_name: cert.recipientName,
        course_title:   cert.courseTitle,
        organization:   cert.organization,
        instructor:     cert.instructor,
        date:           cert.date,
        theme_idx:      cert.themeIdx,
        created_at:     cert.createdAt,
        verified_count: cert.verifiedCount + 1,
        issuer_name:    cert.userId?.name || '',
        issuer_org:     cert.userId?.org  || '',
      },
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
