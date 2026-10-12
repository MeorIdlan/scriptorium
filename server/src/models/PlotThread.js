import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const plotThreadSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    order: { type: Number, default: 0 },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

// Names are unique per work, ignoring case; the route's check is only a fast path
plotThreadSchema.index({ workId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('PlotThread', plotThreadSchema);
