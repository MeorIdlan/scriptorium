import AuditLog from '../models/AuditLog.js';

export async function log({ userId, action, metadata = {} }) {
  await AuditLog.create({
    userId,
    action,
    metadata,
    createdAt: new Date().toISOString(),
  });
}
