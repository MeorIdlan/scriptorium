import mongoose from 'mongoose';

const otpCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, required: true, enum: ['register', 'recovery'] },
    codeHash: { type: String, required: true },
    codeExpiresAt: { type: Date },
    // TTL purge time for the record. Outlives the code so failed attempts keep counting across reissues.
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    attemptsWindowStart: { type: Date, default: null },
  },
  { versionKey: false }
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

export default mongoose.model('OtpCode', otpCodeSchema);
