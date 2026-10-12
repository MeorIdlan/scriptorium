import { Router } from 'express';
import PlotThread from '../models/PlotThread.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { threadCreate, threadUpdate, newThreadId, defaultThreadColor } from '../services/threadFields.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

const refused = (r) => httpError(400, r.code, r.message);
const notFound = () => httpError(404, 'NOT_FOUND', 'Thread not found');
const duplicate = (name) => httpError(409, 'DUPLICATE_NAME', `A thread named "${name}" already exists`);

// Case-insensitive comparison without building a regex from the name
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

async function nameTaken(workId, name, exceptId = null) {
  const filter = { workId, name };
  if (exceptId) filter._id = { $ne: exceptId };
  return Boolean(await PlotThread.findOne(filter).collation(CASE_INSENSITIVE).select('_id').lean());
}

const listThreads = (workId) => PlotThread.find({ workId }).sort({ order: 1, createdAt: 1 });

// GET /api/works/:workId/threads
router.get('/', async (req, res, next) => {
  try {
    res.json(await listThreads(req.params.workId));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/threads
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const fields = threadCreate(req.body);
    if (!fields.ok) return next(refused(fields));
    if (await nameTaken(workId, fields.value.name)) return next(duplicate(fields.value.name));

    const existing = await PlotThread.find({ workId }).select('order').sort({ order: -1 }).lean();
    const now = new Date().toISOString();
    const thread = await PlotThread.create({
      _id: newThreadId(),
      workId,
      color: defaultThreadColor(existing.length),
      ...fields.value,
      order: existing.length ? existing[0].order + 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json(thread);
  } catch (err) {
    next(err?.code === 11000 ? duplicate(req.body?.name?.trim?.() ?? '') : err);
  }
});

// PUT /api/works/:workId/threads/reorder — { ids } lists every thread once
router.put('/reorder', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const ids = req.body?.ids;
    const known = new Set((await PlotThread.find({ workId }).select('_id').lean()).map((t) => t._id));
    const valid =
      Array.isArray(ids) && ids.length === known.size && new Set(ids).size === ids.length && ids.every((id) => known.has(id));
    if (!valid) return next(httpError(400, 'INVALID_FIELD', 'ids must list every thread of this work once'));

    if (ids.length) {
      await PlotThread.bulkWrite(
        ids.map((id, order) => ({ updateOne: { filter: { _id: id, workId }, update: { $set: { order } } } }))
      );
    }
    res.json(await listThreads(workId));
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/threads/:threadId — only name, color, description, status
router.put('/:threadId', async (req, res, next) => {
  try {
    const { workId, threadId } = req.params;
    const update = threadUpdate(req.body);
    if (!update.ok) return next(refused(update));
    if (!(await PlotThread.exists({ _id: threadId, workId }))) return next(notFound());
    if (update.set.name && (await nameTaken(workId, update.set.name, threadId))) {
      return next(duplicate(update.set.name));
    }

    const updated = await PlotThread.findOneAndUpdate(
      { _id: threadId, workId },
      { $set: { ...update.set, updatedAt: new Date().toISOString() } },
      { new: true }
    );
    if (!updated) return next(notFound());
    res.json(updated);
  } catch (err) {
    next(err?.code === 11000 ? duplicate(req.body?.name?.trim?.() ?? '') : err);
  }
});

// DELETE /api/works/:workId/threads/:threadId
router.delete('/:threadId', async (req, res, next) => {
  try {
    const { workId, threadId } = req.params;
    const deleted = await PlotThread.findOneAndDelete({ _id: threadId, workId });
    if (!deleted) return next(notFound());
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
