// Manuscript-format export: pure helpers (no DB, no I/O). The DOCX/PDF builders
// and the details service build on these.

export const MANUSCRIPT_SCENE_BREAK = '#';

// Under 10k words: nearest 100. From 10k: nearest 1,000. Never below 100.
export function roundWordCount(n) {
  const step = n < 10000 ? 100 : 1000;
  return Math.max(100, Math.round(n / step) * step);
}

export function formatWordCount(n) {
  return `about ${roundWordCount(n).toLocaleString('en-US')} words`;
}

export function defaultSurname(authorName) {
  const words = (authorName || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : '';
}

export function headerText({ surname, headerTitle }, page) {
  return `${surname} / ${headerTitle.toUpperCase()} / ${page}`;
}

// Resolution order (spec "Data → Resolving"): an override is used whole, with no
// per-field fallback to the writer's defaults; blank surname and blank author
// name fall back as described there.
export function resolveManuscriptDetails({ settings, work, userName }) {
  const override = work.manuscript?.override;
  const source = override || settings || {};
  const authorName = source.authorName || userName || '';
  return {
    authorName,
    surname: source.surname || defaultSurname(authorName),
    contactBlock: source.contactBlock || '',
    headerTitle: work.manuscript?.headerTitle || work.title,
    font: settings?.font || 'serif',
    workOnly: Boolean(override),
  };
}
