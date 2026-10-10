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

export function cleanSummary(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  text = text.replace(/^(here is|here's)[^:\n]*:\s*/i, '');
  text = text.replace(/^summary:\s*/i, '');
  text = text.trim();
  if (text.length >= 2 && /^["“]/.test(text) && /["”]$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
