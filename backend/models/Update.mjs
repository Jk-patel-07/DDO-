import mongoose from 'mongoose';

const updateSchema = new mongoose.Schema({
  versionName: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  changes: { type: [String], required: true },
  securityChanges: { type: [String], default: [] },
  bugFixes: { type: [String], default: [] },
  downloadUrl: { type: String, required: true },
  publishedBy: { type: String, required: true },
  publishedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

export default mongoose.models.Update || mongoose.model('Update', updateSchema);
