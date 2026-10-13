import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const snapshotSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    chapterId: { type: String, required: true },
    chapterTitle: { type: String, default: '' },
    kind: { type: String, enum: ['auto', 'named', 'milestone'], required: true },
    name: { type: String, default: '' }, // the writer's name for a named snapshot
    note: { type: String, default: '' }, // system label, e.g. 'Before restore'
    milestoneId: { type: String, default: null },
    content: { type: String, default: '' },
    contentHtml: { type: String, default: '' },
    threadIds: { type: [String], default: undefined }, // chapter tags; absent on snapshots from before tagging
    wordCount: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
  },
  { toJSON: idTransform, versionKey: false }
);

snapshotSchema.index({ chapterId: 1, createdAt: -1 });
snapshotSchema.index({ milestoneId: 1 });

export default mongoose.model('Snapshot', snapshotSchema);
