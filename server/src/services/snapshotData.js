import { randomBytes } from 'node:crypto';

// Pure helpers for snapshot documents

const suffix = () => randomBytes(4).toString('hex');
export const newSnapshotId = () => `snap_${Date.now()}_${suffix()}`;
export const newMilestoneId = () => `ms_${Date.now()}_${suffix()}`;

export function snapshotFields(chapter) {
  return {
    workId: chapter.workId,
    chapterId: chapter._id,
    chapterTitle: chapter.title || '',
    content: chapter.content || '',
    contentHtml: chapter.contentHtml || '',
    wordCount: chapter.wordCount || 0,
  };
}

// Old embedded `draftHistory` entries → automatic snapshots. Ids are derived
// from the chapter and time, so re-running the migration is safe.
export function snapshotsFromDraftHistory(chapter) {
  const seen = new Set();
  const docs = [];
  for (const entry of chapter.draftHistory || []) {
    const t = Date.parse(entry?.savedAt);
    if (Number.isNaN(t)) continue;
    const _id = `snap_${chapter._id}_${t}`;
    if (seen.has(_id)) continue;
    seen.add(_id);
    docs.push({
      _id,
      workId: chapter.workId,
      chapterId: chapter._id,
      chapterTitle: chapter.title || '',
      kind: 'auto',
      name: '',
      note: '',
      milestoneId: null,
      content: entry.contentSnapshot || '',
      contentHtml: entry.htmlSnapshot || '',
      wordCount: entry.wordCount || 0,
      createdAt: entry.savedAt,
    });
  }
  return docs;
}
