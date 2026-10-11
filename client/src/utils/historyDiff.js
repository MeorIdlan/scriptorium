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

export function buildHistoryDiff(before, after, { maxCells = MAX_DIFF_CELLS } = {}) {
  const a = before || '';
  const b = after || '';
  const paragraphLevel = sentenceSpans(a).length * sentenceSpans(b).length > maxCells;
  const raw = diffSentences(a, b, paragraphLevel ? paragraphSpans : sentenceSpans);

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
