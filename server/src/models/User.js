import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const userSchema = new mongoose.Schema(
  {
    _id: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    createdAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('User', userSchema);
