const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    id:         { type: String, required: true, unique: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planType:   { type: String, required: true },
    paymentId:  { type: String, required: true, unique: true },
    screenshot: { type: String, default: null },
    trxnId:     { type: String, default: null },
    note:       { type: String, default: null },
    status:     { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  },
  { timestamps: true }
);

// Compound index: find pending/rejected/approved by user (used in status + pending-check)
paymentSchema.index({ userId: 1, status: 1 });
// Admin list (all payments sorted by date)
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
