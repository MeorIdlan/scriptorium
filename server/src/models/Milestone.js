import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const milestoneChapterSchema = new mongoose.Schema(
  {
    chapterId: { type: String, required: true },
    title: { type: String, default: '' },
    order: { type: Number, default: 0 },
    snapshotId: { type: String, required: true },
    wordCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const milestoneSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    createdAt: { type: String, required: true },
    chapters: { type: [milestoneChapterSchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Milestone', milestoneSchema);
