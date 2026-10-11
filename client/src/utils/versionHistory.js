// Helpers for the chapter history and milestone views. Pure except
// flushOpenChapter, which takes the api object so it can be tested.

export const CURRENT = 'current';

const DATE_FORMAT = { day: 'numeric', month: 'short', year: 'numeric' };

export function versionLabel(version) {
  if (version.kind === 'named') return `★ ${version.name}`;
  if (version.kind === 'milestone') return `◆ ${version.milestoneName || 'Milestone'}`;
  return version.note || 'Autosave';
}

export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', DATE_FORMAT);
}

export function groupByDay(versions, now = new Date()) {
  const groups = [];
  for (const version of versions) {
    const label = dayLabel(version.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(version);
    else groups.push({ label, items: [version] });
  }
  return groups;
}

export function defaultMilestoneName(now = new Date()) {
  return `Milestone — ${now.toLocaleDateString('en-GB', DATE_FORMAT)}`;
}

const timeOf = (version) => (version.id === CURRENT ? Infinity : Date.parse(version.createdAt));

// [older, newer]; the current text is always the newer side
export function orderPair(a, b) {
  return timeOf(a) <= timeOf(b) ? [a, b] : [b, a];
}

// Saves typing autosave hasn't stored yet, so a snapshot, restore or
// milestone taken next includes it
export async function flushOpenChapter(api, workId, editorState, chapterId) {
  if (editorState.chapterId !== chapterId || !editorState.hasUnsavedChanges) return;
  await api.put(`/works/${workId}/chapters/${chapterId}`, {
    content: editorState.content,
    contentHtml: editorState.html,
  });
}
