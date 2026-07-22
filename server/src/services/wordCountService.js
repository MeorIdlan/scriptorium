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
