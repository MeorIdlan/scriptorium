import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String },
    activeProvider: { type: String, default: 'anthropic' },
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },
    generation: { type: mongoose.Schema.Types.Mixed, default: {} },
    autoFeatures: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Settings', settingsSchema);
