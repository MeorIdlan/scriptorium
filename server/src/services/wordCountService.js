import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function recalculate(workId) {
  const [result] = await Chapter.aggregate([
    { $match: { workId } },
    { $group: { _id: null, total: { $sum: '$wordCount' } } },
  ]);
  const total = result?.total ?? 0;
  const now = new Date().toISOString();
  await Work.findByIdAndUpdate(workId, { wordCount: total, updatedAt: now });
  return total;
}

// Words added by a save. Decreases are ignored, so deleting or moving text never lowers the day (A4).
export function gainFor(oldWords, newWords) {
  return Math.max(0, newWords - oldWords);
}

// The calendar date for `date` in an IANA timezone, as YYYY-MM-DD. Throws RangeError for an unknown zone.
export function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
