import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    scope: { type: String, required: true, enum: ['pending_passkey', 'full'] },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuthSession', authSessionSchema);
