const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    id:            { type: String, required: true, unique: true, uppercase: true, trim: true },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientName: { type: String, required: true, trim: true },
    courseTitle:   { type: String, required: true, trim: true },
    organization:  { type: String, default: '' },
    instructor:    { type: String, default: '' },
    date:          { type: String, default: '' },
    themeIdx:      { type: Number, default: 0 },
    logoUrl:       { type: String, default: null },
    sigUrl:        { type: String, default: null },
    verifiedCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Compound index for the primary query: user's certs sorted by date
certificateSchema.index({ userId: 1, createdAt: -1 });
// Compound for the monthly stats aggregation
certificateSchema.index({ userId: 1, createdAt: 1 });
// Text index for search (recipient, course)
certificateSchema.index({ recipientName: 'text', courseTitle: 'text' });

module.exports = mongoose.model('Certificate', certificateSchema);
