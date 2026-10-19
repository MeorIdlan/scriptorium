import Work from '../models/Work.js';

// Records that a work's content changed, so the backup reminder can tell a backup is behind.
// Errors are logged, never thrown: a failed stamp must not fail the write it follows.
export async function stampWork(workId, userId) {
  try {
    await Work.updateOne(
      { _id: workId, ownerId: userId },
      { $set: { contentChangedAt: new Date().toISOString() } }
    );
  } catch (err) {
    console.error('Failed to stamp contentChangedAt:', err);
  }
}

// Mount first in a content router. Stamps after a successful non-GET response.
export function stampContentChange(req, res, next) {
  const { workId } = req.params;
  const userId = req.user.id;
  res.on('finish', () => {
    if (req.method === 'GET' || res.statusCode < 200 || res.statusCode >= 300 || !workId) return;
    stampWork(workId, userId);
  });
  next();
}
