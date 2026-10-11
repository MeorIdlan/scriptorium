// Validation for catch writes. Pure, so routes stay thin and it can be tested
// without Mongo. Only the fields a client may change are ever returned.
import { randomBytes } from 'node:crypto';

export const MAX_CATCH_LENGTH = 2000;
export const CATCH_STATUSES = ['open', 'used', 'discarded'];
export const USED_AS_KINDS = ['insert', 'codex-character', 'codex-place', 'codex-rule', 'map-note'];
const MAX_REF_LENGTH = 100;
const MAX_LABEL_LENGTH = 120;

export const newCatchId = () => `catch_${Date.now()}_${randomBytes(4).toString('hex')}`;

const fail = (field, message) => ({ ok: false, field, message });

export function catchContent(value) {
  if (typeof value !== 'string') return fail('content', 'content must be text');
  const content = value.trim();
  if (!content) return fail('content', 'content is required');
  if (content.length > MAX_CATCH_LENGTH) {
    return fail('content', `content must be at most ${MAX_CATCH_LENGTH} characters`);
  }
  return { ok: true, value: content };
}

export function catchTag(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > MAX_REF_LENGTH) {
    return fail('taggedChapterId', 'taggedChapterId must be a chapter id or null');
  }
  return { ok: true, value };
}

function usedAsValue(value) {
  if (value === null) return { ok: true, value: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('usedAs', 'usedAs must be an object or null');
  }
  const { kind, refId, label } = value;
  if (!USED_AS_KINDS.includes(kind)) return fail('usedAs', 'usedAs.kind is not valid');
  if (typeof refId !== 'string' || !refId || refId.length > MAX_REF_LENGTH) {
    return fail('usedAs', 'usedAs.refId must be a short id');
  }
  if (typeof label !== 'string' || label.length > MAX_LABEL_LENGTH) {
    return fail('usedAs', 'usedAs.label must be short text');
  }
  return { ok: true, value: { kind, refId, label } };
}

export function catchUpdate(body) {
  const src = body && typeof body === 'object' ? body : {};
  const set = {};

  if ('content' in src) {
    const r = catchContent(src.content);
    if (!r.ok) return r;
    set.content = r.value;
  }
  if ('taggedChapterId' in src) {
    const r = catchTag(src.taggedChapterId);
    if (!r.ok) return r;
    set.taggedChapterId = r.value;
  }
  if ('status' in src) {
    if (!CATCH_STATUSES.includes(src.status)) return fail('status', 'status must be open, used or discarded');
    set.status = src.status;
  }
  if ('usedAs' in src) {
    const r = usedAsValue(src.usedAs);
    if (!r.ok) return r;
    set.usedAs = r.value;
  }
  // A reopened catch hasn't been used as anything
  if (set.status === 'open') set.usedAs = null;

  return { ok: true, set };
}
