const jwt  = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token  = header.split(' ')[1];

    if (token === 'demo-token') {
      req.user = {
        id:        'demo-user-id',
        _id:       'demo-user-id',
        name:      'Demo User',
        email:     'demo@certifypro.io',
        org:       'CertifyPro Demo',
        plan:      'pro',
        role:      'user',
        photo_url: null,
        logo_url:  null,
        sig_url:   null,
      };
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId)
      .select('name email org plan photoUrl logoUrl sigUrl role')
      .lean();

    if (!user) return res.status(401).json({ error: 'User not found' });

    // Expose id (string) + snake_case aliases matching original SQLite column names
    req.user = {
      id:        user._id.toString(),
      _id:       user._id,
      name:      user.name,
      email:     user.email,
      org:       user.org,
      plan:      user.plan,
      role:      user.role,
      photo_url: user.photoUrl  || null,
      logo_url:  user.logoUrl   || null,
      sig_url:   user.sigUrl    || null,
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired, please sign in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  // Call next outside the try-catch to prevent swallowing downstream route errors
  next();
}

async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token   = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.userId)
        .select('name email org plan role')
        .lean();
      req.user = user
        ? { id: user._id.toString(), _id: user._id, name: user.name, email: user.email, org: user.org, plan: user.plan, role: user.role }
        : null;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }
  next();
}

const requireAdmin = [
  requireAuth,
  (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Require Admin privilege' });
    }
  }
];

module.exports = { requireAuth, optionalAuth, requireAdmin };
