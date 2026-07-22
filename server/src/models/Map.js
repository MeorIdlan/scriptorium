import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const beatEntrySchema = new mongoose.Schema({}, { strict: false, _id: false });

const mapSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true, unique: true },
    framework: { type: String, default: '' },
    acts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    chapters: { type: mongoose.Schema.Types.Mixed, default: {} },
    keyBeats: { type: [mongoose.Schema.Types.Mixed], default: [] },
    missingBeats: { type: [beatEntrySchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Map', mapSchema);
