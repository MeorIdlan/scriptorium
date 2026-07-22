import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const draftHistoryEntrySchema = new mongoose.Schema(
  {
    savedAt: { type: String },
    wordCount: { type: Number, default: 0 },
    contentSnapshot: { type: String },
  },
  { _id: false }
);

const chapterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    number: { type: Number },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
    content: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    draftHistory: { type: [draftHistoryEntrySchema], default: [] },
    status: { type: String, default: 'outline' },
    notes: { type: String, default: '' },
    createdAt: { type: String },
    lastEditedAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Chapter', chapterSchema);
