// Deleting a thread removes its tags from every chapter of the work. Snapshots
// are history and stay as they are; a restored stray id is ignored on read.
import PlotThread from '../models/PlotThread.js';
import Chapter from '../models/Chapter.js';
import { stripThreadFromHtml } from './threadTags.js';
import { sceneSummaries } from './sceneMarkers.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function removeThreadFromWork(workId, threadId) {
  // The thread goes first: if cleanup stops partway, leftover ids are strays
  const deleted = await PlotThread.findOneAndDelete({ _id: threadId, workId });
  if (!deleted) return false;

  const chapters = await Chapter.find({
    workId,
    $or: [{ threadIds: threadId }, { contentHtml: { $regex: escapeRegex(threadId) } }],
  }).select('threadIds contentHtml');

  for (const ch of chapters) {
    const set = { threadIds: (ch.threadIds || []).filter((id) => id !== threadId) };
    const contentHtml = stripThreadFromHtml(ch.contentHtml || '', threadId);
    if (contentHtml !== ch.contentHtml) {
      set.contentHtml = contentHtml;
      set.scenes = sceneSummaries(contentHtml);
    }
    // Not a writer edit, so lastEditedAt/updatedAt stay as they are
    await Chapter.updateOne({ _id: ch._id, workId }, { $set: set }, { timestamps: false });
  }
  return true;
}
