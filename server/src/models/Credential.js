import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const credentialSchema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: { type: String, required: true, index: true },
    credentialId: { type: String, required: true, unique: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, default: 0 },
    deviceLabel: { type: String, required: true },
    createdAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Credential', credentialSchema);
