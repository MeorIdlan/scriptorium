// Comparison of two versions of a chapter for the history views. Pure.
import { diffSentences, diffWords, sentenceSpans, paragraphSpans } from './polishDiff.js';

export const MAX_DIFF_CELLS = 4_000_000;

const wordCount = (text) => (text.match(/\S+/g) || []).length;

function changeParts(fromText, toText, maxCells) {
  // diffWords compares tokens (words, spaces, punctuation), roughly 2× words each side
  if (wordCount(fromText) * wordCount(toText) * 4 > maxCells) {
    return [
      ...(fromText ? [{ type: 'del', text: fromText }] : []),
      ...(toText ? [{ type: 'add', text: toText }] : []),
    ];
  }
  return diffWords(fromText, toText);
}

// Too big to align even by paragraph: keep the shared opening and ending
// paragraphs, and show everything between them as one change
function coarseDiff(a, b) {
  const pa = paragraphSpans(a);
  const pb = paragraphSpans(b);
  let prefix = 0;
  while (prefix < pa.length && prefix < pb.length && pa[prefix].text === pb[prefix].text) prefix += 1;
  let suffix = 0;
  while (
    suffix < pa.length - prefix &&
    suffix < pb.length - prefix &&
    pa[pa.length - 1 - suffix].text === pb[pb.length - 1 - suffix].text
  ) {
    suffix += 1;
  }
  const startA = prefix ? pa[prefix - 1].end : 0;
  const endA = suffix ? pa[pa.length - suffix].start : a.length;
  const startB = prefix ? pb[prefix - 1].end : 0;
  const endB = suffix ? pb[pb.length - suffix].start : b.length;
  const equal = (span) => ({ type: 'equal', text: span.text });
  return [
    ...pa.slice(0, prefix).map(equal),
    { type: 'change', fromText: a.slice(startA, endA), toText: b.slice(startB, endB) },
    ...pa.slice(pa.length - suffix).map(equal),
  ];
}

function middleSize(spansA, spansB) {
  let prefix = 0;
  while (prefix < spansA.length && prefix < spansB.length && spansA[prefix].text === spansB[prefix].text) prefix += 1;
  let suffix = 0;
  while (
    suffix < spansA.length - prefix &&
    suffix < spansB.length - prefix &&
    spansA[spansA.length - 1 - suffix].text === spansB[spansB.length - 1 - suffix].text
  ) {
    suffix += 1;
  }
  return (spansA.length - prefix - suffix) * (spansB.length - prefix - suffix);
}

export function buildHistoryDiff(before, after, { maxCells = MAX_DIFF_CELLS } = {}) {
  const a = before || '';
  const b = after || '';
  const paragraphLevel = sentenceSpans(a).length * sentenceSpans(b).length > maxCells;
  let raw;
  if (!paragraphLevel) raw = diffSentences(a, b, sentenceSpans);
  else if (middleSize(paragraphSpans(a), paragraphSpans(b)) <= maxCells) raw = diffSentences(a, b, paragraphSpans);
  else raw = a === b ? paragraphSpans(a).map((span) => ({ type: 'equal', text: span.text })) : coarseDiff(a, b);

  let added = 0;
  let removed = 0;
  const segments = raw.map((seg) => {
    if (seg.type === 'equal') return { type: 'equal', text: seg.text };
    const parts = changeParts(seg.fromText, seg.toText, maxCells);
    for (const part of parts) {
      if (part.type === 'add') added += wordCount(part.text);
      if (part.type === 'del') removed += wordCount(part.text);
    }
    return { type: 'change', parts };
  });
  return { segments, added, removed, paragraphLevel };
}

const lines = (text) => text.split(/(?<=\n)/);

// Hides the middle of long unchanged stretches. Next to a change it keeps
// the partial line touching the change plus `context` whole lines.
export function collapseUnchanged(segments, context = 1) {
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === 'equal' && last?.type === 'equal') merged[merged.length - 1] = { type: 'equal', text: last.text + seg.text };
    else merged.push(seg);
  }

  const out = [];
  merged.forEach((seg, i) => {
    if (seg.type !== 'equal') {
      out.push(seg);
      return;
    }
    const pieces = lines(seg.text);
    const head = i > 0 ? context + 1 : 0;
    const tail = i < merged.length - 1 ? context + 1 : 0;
    const hidden = pieces.length - head - tail;
    if (hidden < 2) {
      out.push(seg);
      return;
    }
    if (head) out.push({ type: 'equal', text: pieces.slice(0, head).join('') });
    out.push({ type: 'collapsed', text: pieces.slice(head, head + hidden).join(''), paragraphs: hidden });
    if (tail) out.push({ type: 'equal', text: pieces.slice(head + hidden).join('') });
  });
  return out;
}

// False when the versions differ only in spacing (e.g. the editor's
// non-breaking spaces), so the view can say "No text changes"
export function hasTextChanges(diff) {
  return diff.segments.some((s) => s.type === 'change' && s.parts.some((p) => p.type !== 'same' && /\S/.test(p.text)));
}
