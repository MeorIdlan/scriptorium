import { httpError } from '../middleware/errorHandler.js';

export const MAX_NAME_LENGTH = 80;

// Names for named snapshots and milestones
export function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw httpError(400, 'MISSING_FIELD', 'name is required');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw httpError(400, 'TOO_LONG', `name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return trimmed;
}
