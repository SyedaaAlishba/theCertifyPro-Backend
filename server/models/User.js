const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name:             { type: String, required: true, trim: true },
    email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:         { type: String, default: null, select: false }, // excluded from queries by default
    org:              { type: String, default: '' },
    plan:             { type: String, enum: ['free', 'pro'], default: 'free' },
    provider:         { type: String, enum: ['email', 'google'], default: 'email' },
    role:             { type: String, enum: ['user', 'admin'], default: 'user' },
    resetToken:       { type: String, default: null, select: false },
    resetTokenExpiry: { type: Date,   default: null, select: false },
    photoUrl:         { type: String, default: null },
    logoUrl:          { type: String, default: null },
    sigUrl:           { type: String, default: null },
  },
  { timestamps: true }
);

// email is already unique — drives an implicit index.
// Explicit index for role-based admin queries
userSchema.index({ role: 1 });
// Compound: find by resetToken + expiry in password-reset flow
userSchema.index({ resetToken: 1, resetTokenExpiry: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
