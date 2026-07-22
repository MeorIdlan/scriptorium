import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

export default mongoose.model('AuditLog', auditLogSchema);
