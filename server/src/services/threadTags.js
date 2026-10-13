// Plot-thread tags. A scene's tags are a data-threads attribute (space-separated
// thread ids) on its <hr data-scene> marker; a chapter's are Chapter.threadIds.
// Ids that are not current threads of the work are strays and are ignored.
export const THREAD_ID = /^thr_[A-Za-z0-9_]{1,60}$/;
export const MAX_TAGS = 50;

export function parseThreadIds(value) {
  if (typeof value !== 'string') return [];
  const ids = [];
  for (const id of value.split(/\s+/)) {
    if (ids.length >= MAX_TAGS) break;
    if (THREAD_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function knownThreadIds(ids, known) {
  return (ids || []).filter((id) => known.has(id));
}

// Only touches the data-threads attribute of <hr> tags, so the rest of the
// stored HTML stays byte-for-byte the same
const MARKER_THREADS = /(<hr\b[^>]*?)\s+data-threads="([^"]*)"/g;

export function stripThreadFromHtml(html, threadId) {
  return html.replace(MARKER_THREADS, (match, before, list) => {
    const kept = list.split(/\s+/).filter((id) => id && id !== threadId);
    return kept.length ? `${before} data-threads="${kept.join(' ')}"` : before;
  });
}

// Validates a tag list sent by a client. A clean list comes back deduped.
export function checkTagList(value) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    return { ok: false, message: 'threadIds must be an array of thread ids' };
  }
  if (value.some((id) => !THREAD_ID.test(id))) {
    return { ok: false, message: 'threadIds contains an invalid thread id' };
  }
  const ids = [...new Set(value)];
  if (ids.length > MAX_TAGS) return { ok: false, message: `At most ${MAX_TAGS} thread tags are allowed` };
  return { ok: true, ids };
}

// Drops ids that aren't current threads from scene markers; the rest of the HTML is untouched
export function filterHtmlThreads(html, known) {
  if (typeof html !== 'string' || !html) return html;
  return html.replace(MARKER_THREADS, (match, before, list) => {
    const kept = list.split(/\s+/).filter((id) => id && known.has(id));
    return kept.length ? `${before} data-threads="${kept.join(' ')}"` : before;
  });
}
