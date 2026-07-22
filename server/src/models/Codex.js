import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const entitySchema = new mongoose.Schema({}, { strict: false, _id: false });

const codexSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true, unique: true },
    characters: { type: [entitySchema], default: [] },
    places: { type: [entitySchema], default: [] },
    worldRules: { type: [entitySchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Codex', codexSchema);
