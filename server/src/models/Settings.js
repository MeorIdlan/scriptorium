import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String },
    activeProvider: { type: String, default: 'anthropic' },
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },
    generation: { type: mongoose.Schema.Types.Mixed, default: {} },
    autoFeatures: { type: mongoose.Schema.Types.Mixed, default: {} },
    // No default: unset means the writer hasn't chosen yet (see isAiEnabled)
    aiEnabled: { type: Boolean },
    // No default: unset means no daily goal (see progressService)
    dailyWordGoal: { type: Number },
    // No default: unset means no writer defaults yet (see manuscriptDetails)
    manuscript: { type: mongoose.Schema.Types.Mixed },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Settings', settingsSchema);
