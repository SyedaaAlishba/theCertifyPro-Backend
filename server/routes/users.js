const express = require('express');
const User           = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/users/profile ────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('name email org plan provider role photoUrl logoUrl sigUrl createdAt')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: normUser(user) });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PUT /api/users/profile ────────────────────────────────────────────────────
router.put('/profile', async (req, res) => {
  try {
    const { name, email, org, photoUrl, logoUrl, sigUrl } = req.body;

    // Check email not taken by someone else
    if (email) {
      const taken = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user.id } });
      if (taken) return res.status(409).json({ error: 'Email already in use' });
    }

    const updates = {};
    if (name     !== undefined) updates.name     = name;
    if (email    !== undefined) updates.email    = email.toLowerCase();
    if (org      !== undefined) updates.org      = org;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;
    if (logoUrl  !== undefined) updates.logoUrl  = logoUrl;
    if (sigUrl   !== undefined) updates.sigUrl   = sigUrl;

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    ).select('name email org plan provider role photoUrl logoUrl sigUrl').lean();

    res.json({ user: normUser(updated) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── POST /api/users/upgrade ───────────────────────────────────────────────────
router.post('/upgrade', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $set: { plan: 'pro' } });
    res.json({ message: 'Upgraded to Pro', plan: 'pro' });
  } catch (err) {
    res.status(500).json({ error: 'Upgrade failed' });
  }
});

// ── DELETE /api/users/account ─────────────────────────────────────────────────
router.delete('/account', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Normalise camelCase → snake_case for client
function normUser(u) {
  return {
    id:         u._id?.toString(),
    name:       u.name,
    email:      u.email,
    org:        u.org,
    plan:       u.plan,
    provider:   u.provider,
    role:       u.role,
    photo_url:  u.photoUrl,
    logo_url:   u.logoUrl,
    sig_url:    u.sigUrl,
    created_at: u.createdAt,
  };
}

module.exports = router;
