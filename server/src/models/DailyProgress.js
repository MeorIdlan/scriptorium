import mongoose from 'mongoose';

const dailyProgressSchema = new mongoose.Schema(
  {
    _id: { type: String }, // `${userId}_${YYYY-MM-DD}`
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    words: { type: Number, default: 0 },
    updatedAt: { type: String },
  },
  { versionKey: false }
);

export default mongoose.model('DailyProgress', dailyProgressSchema);
