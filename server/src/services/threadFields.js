// Validation for plot-thread writes. Pure, so routes stay thin and it can be
// tested without Mongo. Only the fields a client may change are ever returned.
import { randomBytes } from 'node:crypto';

export const THREAD_LIMITS = { name: 80, description: 1000 };
export const THREAD_STATUSES = ['open', 'resolved'];
export const THREAD_PALETTE = ['#c9a96e', '#7fa7d9', '#d97f7f', '#8fc98f', '#b58fd9', '#d9a35f', '#6fc2c2', '#d98fb8'];
const FIELDS = ['name', 'color', 'description', 'status'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const newThreadId = (now = Date.now()) => `thr_${now}_${randomBytes(3).toString('hex')}`;
export const defaultThreadColor = (count) => THREAD_PALETTE[count % THREAD_PALETTE.length];

const fail = (field, message, code = 'INVALID_FIELD') => ({ ok: false, field, code, message });
const ok = (value) => ({ ok: true, value });

function check(field, value) {
  switch (field) {
    case 'name': {
      if (typeof value !== 'string') return fail('name', 'name must be text');
      const name = value.trim();
      if (!name) return fail('name', 'name is required');
      if (name.length > THREAD_LIMITS.name) return fail('name', `name must be at most ${THREAD_LIMITS.name} characters`);
      return ok(name);
    }
    case 'color':
      if (typeof value !== 'string' || !HEX.test(value)) return fail('color', 'color must be a #rrggbb colour');
      return ok(value.toLowerCase());
    case 'description': {
      if (typeof value !== 'string') return fail('description', 'description must be text');
      const description = value.trim();
      if (description.length > THREAD_LIMITS.description) {
        return fail('description', `description must be at most ${THREAD_LIMITS.description} characters`);
      }
      return ok(description);
    }
    case 'status':
      if (!THREAD_STATUSES.includes(value)) return fail('status', 'status must be open or resolved');
      return ok(value);
    default:
      return fail(field, `${field} cannot be set on a thread`);
  }
}

const bodyOf = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});

export function threadUpdate(body) {
  const src = bodyOf(body);
  const unknown = Object.keys(src).find((key) => !FIELDS.includes(key));
  if (unknown) return fail(unknown, `${unknown} cannot be set on a thread`);
  const set = {};
  for (const field of FIELDS) {
    if (!(field in src)) continue;
    const r = check(field, src[field]);
    if (!r.ok) return r;
    set[field] = r.value;
  }
  return { ok: true, set };
}

export function threadCreate(body) {
  const src = bodyOf(body);
  if (src.name === undefined || src.name === null || (typeof src.name === 'string' && !src.name.trim())) {
    return fail('name', 'name is required', 'MISSING_FIELD');
  }
  const r = threadUpdate(src);
  return r.ok ? ok(r.set) : r;
}
