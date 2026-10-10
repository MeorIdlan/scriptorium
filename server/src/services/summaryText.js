import crypto from 'node:crypto';

export function hashContent(text) {
  return crypto.createHash('sha1').update(text || '').digest('hex');
}

// none | current | outdated | edited | edited-outdated
export function summaryStatus(chapter) {
  const summary = chapter.summary || {};
  if (!summary.text) return 'none';
  const fresh = summary.sourceHash === hashContent(chapter.content || '');
  if (summary.edited) return fresh ? 'edited' : 'edited-outdated';
  return fresh ? 'current' : 'outdated';
}

// Edited summaries are never regenerated automatically; empty chapters get none
export function needsGeneration(chapter) {
  if (!chapter.content || !chapter.content.trim()) return false;
  const status = summaryStatus(chapter);
  return status === 'none' || status === 'outdated';
}

// Keeps the opening and the ending, which matter most for a summary
export function truncateMiddle(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const marker = '\n\n[…]\n\n';
  const keep = maxChars - marker.length;
  const head = Math.ceil(keep / 2);
  return text.slice(0, head) + marker + text.slice(text.length - (keep - head));
}

const LEAD_IN = /^(sure|certainly|okay|ok|of course)[!,.]?\s*/i;
const INTRO_LINE = /^\**\s*(here|below|this is|summary)/i;
const LABEL = /^\*{0,2}\s*summary\s*\*{0,2}\s*:\s*\*{0,2}\s*/i;

export function cleanSummary(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim().replace(LEAD_IN, '');

  // A first line that only introduces the summary, e.g.
  // "Here is the summary of Chapter 1: The Bell:"
  const firstBreak = text.indexOf('\n');
  if (firstBreak > 0) {
    const first = text.slice(0, firstBreak).trim();
    if (first.endsWith(':') && INTRO_LINE.test(first)) text = text.slice(firstBreak).trim();
  }

  text = text.replace(/^(here is|here's)[^:\n]*:\s*/i, '');
  text = text.replace(LABEL, '').trim();

  // Unwrap quotes around the whole summary, but not quotes that open and
  // close dialogue inside it
  if (text.length >= 2 && /^["“]/.test(text) && /["”]$/.test(text) && !/["“”]/.test(text.slice(1, -1))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
