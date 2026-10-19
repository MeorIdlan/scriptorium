import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

// Backup reminder snooze/dismiss state; no defaults (absent means never)
const reminderStateSchema = new mongoose.Schema(
  {
    snoozedUntil: { type: String },
    dismissedAt: { type: String },
  },
  { _id: false }
);

const workSchema = new mongoose.Schema(
  {
    _id: { type: String },
    ownerId: { type: String, required: true, index: true },
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
    // No default: absent means no per-work manuscript details (see manuscriptDetails)
    manuscript: { type: mongoose.Schema.Types.Mixed },
    lastTouched: { type: String },
    // Backup reminder: server-owned, no defaults (absent means never backed up / no change)
    lastBackupAt: { type: String },
    contentChangedAt: { type: String },
    reminderState: { type: reminderStateSchema },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Work', workSchema);
