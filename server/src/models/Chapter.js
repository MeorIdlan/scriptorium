import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const draftHistoryEntrySchema = new mongoose.Schema(
  {
    savedAt: { type: String },
    wordCount: { type: Number, default: 0 },
    contentSnapshot: { type: String },
    htmlSnapshot: { type: String },
  },
  { _id: false }
);

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
    draftHistory: { type: [draftHistoryEntrySchema], default: [] },
    status: { type: String, default: 'outline' },
    notes: { type: String, default: '' },
    summary: { type: summarySchema, default: () => ({}) },
    createdAt: { type: String },
    lastEditedAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Chapter', chapterSchema);
