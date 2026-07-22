import mongoose from 'mongoose';

const webauthnChallengeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ['registration', 'authentication'] },
    challenge: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

webauthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('WebauthnChallenge', webauthnChallengeSchema);
