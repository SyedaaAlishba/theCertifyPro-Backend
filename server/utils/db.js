const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'alishbasyeda057@gmail.com').trim().toLowerCase();

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const dbName = mongoose.connection.db.databaseName;
  console.log(`  ✓ MongoDB connected → ${dbName}`);

  // ── Admin enforcement ──────────────────────────────────────────────────────
  // Run unconditionally in production; in development only when explicitly requested.
  const shouldEnforceAdmin =
    process.env.NODE_ENV === 'production' || process.env.ADMIN_SETUP === 'true';

  if (shouldEnforceAdmin) {
    await enforceAdmin();
  }

  console.log('  ✓ Database ready');
}

async function enforceAdmin() {
  // Lazy-require to avoid circular dep at module load time
  const User = require('../models/User');

  try {
    // Strip admin from everyone except the designated email
    await User.updateMany(
      { role: 'admin', email: { $ne: ADMIN_EMAIL } },
      { $set: { role: 'user' } }
    );

    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
    if (!existingAdmin) {
      const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
      if (!adminPassword) {
        console.error('  ⚠ Admin user not created: set ADMIN_PASSWORD to bootstrap admin safely.');
        return;
      }
      const hash = await bcrypt.hash(adminPassword, 12);
      await User.create({
        name:     'System Admin',
        email:    ADMIN_EMAIL,
        password: hash,
        org:      'CertifyPro Admin',
        plan:     'pro',
        role:     'admin',
        provider: 'email',
      });
      console.log(`  ✓ Created admin user: ${ADMIN_EMAIL}`);
    } else {
      await User.findByIdAndUpdate(existingAdmin._id, {
        $set: { role: 'admin', plan: 'pro' },
      });
    }
  } catch (err) {
    // Non-fatal — log and continue; don't crash the server over admin setup
    console.error('  ⚠ Admin enforcement warning:', err.message);
  }
}

module.exports = { connectDB };
