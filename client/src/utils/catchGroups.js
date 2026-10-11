// Pure helpers for showing catches: labels, search, grouping and counts.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function chapterLabel(chapter) {
  const title = (chapter?.title || '').trim() || 'Untitled';
  return `Ch. ${chapter?.number ?? '?'} — ${title}`;
}

const newestFirst = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const bookOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.number ?? 0) - (b.number ?? 0);

export function filterCatches(catches, { status = 'open', query = '', chapters = [] } = {}) {
  const q = query.trim().toLowerCase();
  const titles = new Map(chapters.map((ch) => [ch.id, (ch.title || '').toLowerCase()]));
  return (catches || []).filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (!q) return true;
    return (c.content || '').toLowerCase().includes(q) || (titles.get(c.taggedChapterId) || '').includes(q);
  });
}

export function groupCatches(catches, chapters, currentChapterId) {
  const byId = new Map(chapters.map((ch) => [ch.id, ch]));
  const here = [];
  const untagged = [];
  const others = new Map();
  for (const c of [...catches].sort(newestFirst)) {
    const chapter = c.taggedChapterId ? byId.get(c.taggedChapterId) : null;
    if (!chapter) untagged.push(c);
    else if (chapter.id === currentChapterId) here.push(c);
    else {
      if (!others.has(chapter.id)) others.set(chapter.id, []);
      others.get(chapter.id).push(c);
    }
  }

  const groups = [];
  if (here.length) groups.push({ key: 'this', title: 'For this chapter', items: here });
  if (untagged.length) groups.push({ key: 'untagged', title: 'Untagged', items: untagged });
  for (const chapter of [...chapters].sort(bookOrder)) {
    if (others.has(chapter.id)) groups.push({ key: chapter.id, title: chapterLabel(chapter), items: others.get(chapter.id) });
  }
  return groups;
}

export function openCountsByChapter(catches) {
  const counts = new Map();
  for (const c of catches || []) {
    if (c.status !== 'open' || !c.taggedChapterId) continue;
    counts.set(c.taggedChapterId, (counts.get(c.taggedChapterId) || 0) + 1);
  }
  return counts;
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const age = Math.max(0, now - t);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (age < 30 * DAY) return `${Math.floor(age / DAY)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const USED_AS_PREFIX = {
  insert: 'Inserted in',
  'codex-character': 'Codex character:',
  'codex-place': 'Codex place:',
  'codex-rule': 'Codex rule:',
  'map-note': 'Map note:',
};

export function usedAsLabel(usedAs) {
  const prefix = usedAs && USED_AS_PREFIX[usedAs.kind];
  return prefix ? `${prefix} ${usedAs.label}` : '';
}
