import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import { snapshotsFromDraftHistory } from './snapshotData.js';

// One-time move of the old embedded `draftHistory` into the Snapshot
// collection. Upserts by fixed ids, and only removes a chapter's
// `draftHistory` once its snapshots are stored, so a crash just re-runs.
export async function migrateDraftHistory() {
  const chapters = Chapter.collection.find(
    { draftHistory: { $exists: true } },
    { projection: { workId: 1, title: 1, draftHistory: 1, updatedAt: 1, createdAt: 1 } }
  );
  let moved = 0;
  for await (const chapter of chapters) {
    try {
      const docs = snapshotsFromDraftHistory(chapter);
      if (docs.length) {
        await Snapshot.collection.bulkWrite(
          docs.map(({ _id, ...doc }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: doc }, upsert: true } }))
        );
      }
      await Chapter.collection.updateOne({ _id: chapter._id }, { $unset: { draftHistory: '' } });
      moved += 1;
    } catch (err) {
      console.error(`Draft history migration failed for chapter ${chapter._id}:`, err);
    }
  }
  if (moved) console.log(`Moved draft history of ${moved} chapter(s) into snapshots`);
}
