const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
  {
    certId:    { type: String, required: true },
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'verifiedAt', updatedAt: false } }
);

verificationSchema.index({ certId: 1 });

module.exports = mongoose.model('Verification', verificationSchema);
