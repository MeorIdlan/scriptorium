import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const workSchema = new mongoose.Schema(
  {
    _id: { type: String },
    title: { type: String, required: true },
    genre: { type: String, default: '' },
    tone: { type: String, default: '' },
    pov: { type: String, default: '' },
    protagonist: { type: String, default: '' },
    premise: { type: String, default: '' },
    status: { type: String, default: 'drafting' },
    wordCount: { type: Number, default: 0 },
    chapterCount: { type: Number, default: 0 },
    currentDraft: { type: Number, default: 1 },
    coverColor: { type: String, default: '' },
    logline: { type: String, default: '' },
    lastTouched: { type: String },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Work', workSchema);
