import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const summarySchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    sourceHash: { type: String, default: '' }, // sha1 of `content` the summary describes
    generatedAt: { type: String, default: null },
    edited: { type: Boolean, default: false }, // set when the writer edits it
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
    content: { type: String, default: '' }, // plain text, derived from contentHtml by the editor
    contentHtml: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    status: { type: String, default: 'outline' },
    notes: { type: String, default: '' },
    summary: { type: summarySchema, default: () => ({}) },
    // Derived from contentHtml's scene markers on every save; [] = no markers
    scenes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Plot threads tagged on the chapter as a whole (scene tags live on the markers)
    threadIds: { type: [String], default: [] },
    createdAt: { type: String },
    lastEditedAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Chapter', chapterSchema);
