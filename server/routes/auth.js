const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const passport = require('passport');

const User           = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const logger          = require('../utils/logger');
const validate        = require('../utils/validation');
const emailSvc        = require('../utils/email');

const router = express.Router();

// Helper — Hash a token
function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// Helper — issue a JWT
function signToken(userId) {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not defined in environment!');
    throw new Error('Server configuration error');
  }
  return jwt.sign(
    { userId: userId.toString() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Helper — normalise Mongoose camelCase → snake_case to match original SQLite shape
function safeUser(u) {
  const obj = u.toObject ? u.toObject() : { ...u };
  return {
    id:         (obj._id || '').toString(),
    name:       obj.name,
    email:      obj.email,
    org:        obj.org,
    plan:       obj.plan,
    provider:   obj.provider,
    role:       obj.role,
    photo_url:  obj.photoUrl  || null,
    logo_url:   obj.logoUrl   || null,
    sig_url:    obj.sigUrl    || null,
    created_at: obj.createdAt || null,
    updated_at: obj.updatedAt || null,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    let { name, email, password, org = '' } = req.body;

    if (!validate.isValidName(name))
      return res.status(400).json({ error: 'Name must be 2-50 characters' });
    if (!validate.isEmail(email))
      return res.status(400).json({ error: 'Invalid email address' });
    if (!validate.isStrongPassword(password))
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    name  = validate.sanitize(name);
    org   = validate.sanitize(org);
    email = email.toLowerCase().trim();

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hash,
      org,
      plan: 'free',
      provider: 'email'
    });

    logger.info('User registered', { userId: user._id, email });
    const token = signToken(user._id);
    res.status(201).json({ token, user: safeUser(user) });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    logger.error('Registration failed', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── LOGIN (unchanged) ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || user.provider !== 'email') {
      logger.security('Failed login attempt', { email, reason: 'user_not_found_or_social' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) {
      logger.security('Failed login attempt', { email, reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user._id);
    res.json({ token, user: safeUser(user) });

  } catch (err) {
    logger.error('Login failed', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/google - Start OAuth flow
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

const CLIENT_URL = process.env.CLIENT_URL || 'https://the-certifypro.netlify.app';

router.get('/google/callback',
  passport.authenticate('google', { 
    session: true,
    failureRedirect: `${CLIENT_URL}/auth?error=GoogleAuthFailed`
  }),
  (req, res) => {
    try {
      // Generate JWT token
      const token = jwt.sign(
        { userId: req.user._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      // Redirect to frontend with token
      res.redirect(`${CLIENT_URL}/auth?token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error('Token error:', err);
      res.redirect(`${CLIENT_URL}/auth?error=TokenGenerationFailed`);
    }
  }
);

module.exports = router;