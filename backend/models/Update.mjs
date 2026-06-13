import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  publisher: { type: String, required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, required: true },
  details: { type: String }
});

const updateSchema = new mongoose.Schema({
  updateId: { type: String, required: true, unique: true },
  versionName: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  changes: { type: [String], required: true },
  securityChanges: { type: [String], default: [] },
  bugFixes: { type: [String], default: [] },
  graphicsInfo: { type: String, default: '' },
  changedFiles: { type: [String], default: [] },
  newFiles: { type: [String], default: [] },
  downloadUrl: { type: String, required: true },
  checksum: { type: String, required: true },
  signature: { type: String },
  status: { type: String, enum: ['Draft', 'Confirmed', 'Published', 'Downloaded', 'Installing', 'Installed'], default: 'Draft' },
  publishedBy: { type: String, required: true },
  publishedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: false },
  auditLog: { type: [auditLogSchema], default: [] }
});

export default mongoose.models.Update || mongoose.model('Update', updateSchema);
