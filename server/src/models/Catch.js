import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const catchSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    capturedDuringChapterId: { type: String, default: null },
    taggedChapterId: { type: String, default: null },
    status: { type: String, default: 'open' },
    usedAs: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, refId, label } once used
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Catch', catchSchema);
