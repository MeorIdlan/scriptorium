import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    chapterId: { type: String, default: null },
    wordsAtStart: { type: Number, default: 0 },
    wordsAtEnd: { type: Number, default: null },
    wordsWritten: { type: Number, default: null },
    rekindlerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: String },
    endedAt: { type: String, default: null },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Session', sessionSchema);
