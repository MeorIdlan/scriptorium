import { diffStats } from './textDiff.js';

// The editor writes non-breaking and doubled spaces freely; spacing alone isn't a change
const normalize = (text) => text.replace(/\s+/g, ' ').trim();

// One row per chapter in the milestone or in the work today: today's chapters
// in today's order, then chapters deleted since, in milestone order. Pure.
export function milestoneRows(milestoneChapters, snapshotTexts, currentChapters) {
  const then = new Map(milestoneChapters.map((c) => [c.chapterId, c]));
  const rows = [];

  for (const ch of currentChapters) {
    const entry = then.get(ch._id);
    const wordsNow = ch.wordCount || 0;
    if (!entry) {
      rows.push({
        chapterId: ch._id, title: ch.title, state: 'new', snapshotId: null,
        wordsThen: 0, wordsNow, added: wordsNow, removed: 0,
      });
      continue;
    }
    const thenText = snapshotTexts.get(entry.snapshotId) ?? '';
    const nowText = ch.content || '';
    const same = normalize(thenText) === normalize(nowText);
    const stats = same ? { added: 0, removed: 0 } : diffStats(thenText, nowText);
    rows.push({
      chapterId: ch._id, title: ch.title, state: same ? 'unchanged' : 'changed', snapshotId: entry.snapshotId,
      wordsThen: entry.wordCount || 0, wordsNow, ...stats,
    });
  }

  const present = new Set(currentChapters.map((c) => c._id));
  const deleted = milestoneChapters.filter((c) => !present.has(c.chapterId)).sort((a, b) => a.order - b.order);
  for (const entry of deleted) {
    const wordsThen = entry.wordCount || 0;
    rows.push({
      chapterId: entry.chapterId, title: entry.title, state: 'deleted', snapshotId: entry.snapshotId,
      wordsThen, wordsNow: 0, added: 0, removed: wordsThen,
    });
  }
  return rows;
}
