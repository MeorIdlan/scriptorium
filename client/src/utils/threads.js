// Plot threads on the client. Limits and tag rules match the server
// (server/src/services/threadFields.js and threadTags.js).
export const THREAD_LIMITS = { name: 80, description: 1000 };
export const THREAD_PALETTE = ['#c9a96e', '#7fa7d9', '#d97f7f', '#8fc98f', '#b58fd9', '#d9a35f', '#6fc2c2', '#d98fb8'];

const THREAD_ID = /^thr_[A-Za-z0-9_]{1,60}$/;
const MAX_TAGS = 50;

export function parseThreadIds(value) {
  if (typeof value !== 'string') return [];
  const ids = [];
  for (const id of value.split(/\s+/)) {
    if (ids.length >= MAX_TAGS) break;
    if (THREAD_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function threadNameError(name) {
  const value = (name || '').trim();
  if (!value) return 'Name is required';
  if (value.length > THREAD_LIMITS.name) return `Name must be at most ${THREAD_LIMITS.name} characters`;
  return null;
}

export function threadDescriptionError(text) {
  if ((text || '').trim().length > THREAD_LIMITS.description) {
    return `Description must be at most ${THREAD_LIMITS.description} characters`;
  }
  return null;
}

// Chapters plus scenes that carry the thread
export function threadTagCount(chapters, threadId) {
  let count = 0;
  for (const ch of chapters || []) {
    if ((ch.threadIds || []).includes(threadId)) count += 1;
    for (const scene of ch.scenes || []) if ((scene.threadIds || []).includes(threadId)) count += 1;
  }
  return count;
}

export function deleteMessage(name, count) {
  const ask = `Delete "${name}"?`;
  if (!count) return ask;
  if (count === 1) return `${ask} It's tagged on 1 chapter or scene; the tag will be removed.`;
  return `${ask} It's tagged on ${count} chapters and scenes; the tags will be removed.`;
}
