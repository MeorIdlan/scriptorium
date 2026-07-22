# MongoDB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Scriptorium's JSON-flat-file storage with MongoDB (via Mongoose), add a `mongo` service to the dev Docker Compose stack, and connect the production stack to the shared external Mongo instance the same way `finance-tracker` does.

**Architecture:** One Mongoose collection per entity (`works`, `chapters`, `codices`, `maps`, `catches`, `sessions`, `settings`), using the app's existing custom string IDs as `_id` so client-facing JSON shapes don't change. Route files are converted from sync `readJSON`/`writeJSON` handlers to async Mongoose calls, leaning on aggregation pipelines and atomic update operators (`$push`, `$set` with `arrayFilters`, `bulkWrite`, pipeline-based `findOneAndUpdate`) instead of read-mutate-write-whole-document patterns.

**Tech Stack:** Adds `mongoose` ^8.x. Drops the unused `uuid` dependency. No test runner exists in this repo (per `CLAUDE.md`) — every task's "test" step is a `curl` verification against the running dev stack instead of an automated test file.

## Global Constraints

- Server and client are both ESM (`"type": "module"`) — all new files use `import`/`export`.
- The client talks to the server only through `/api/*` — no client-side changes; every endpoint's request/response JSON shape must stay identical to today's.
- `data/` on disk is left untouched but no longer read or written — this is a fresh start, no migration script (per approved spec).
- No multi-document transactions — none of the current write patterns need them.
- Dates are stored as ISO strings (`type: String`, set via `new Date().toISOString()`), matching current behavior exactly — no switch to native `Date` fields.
- Custom string IDs (`work_xxxxx`, `ch_<ts>_xxx`, `char_xxxxx`, etc.) are preserved as Mongo `_id` values.
- All Node/npm commands on this machine run through `wsl -d ubuntu -e sh -c "..."`; Docker Compose commands run through `wsl -d ubuntu -e docker-compose ...` (per `CLAUDE.md`).

---

### Task 1: Mongo connection infrastructure, dependencies, Docker Compose

**Files:**
- Create: `server/src/db.js`
- Create: `server/src/models/idTransform.js`
- Modify: `server/src/server.js`
- Modify: `server/package.json`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `connectMongo(): Promise<void>` (exported from `server/src/db.js`) — every later task's model files rely on this having connected `mongoose` before any query runs. `idTransform` (exported from `server/src/models/idTransform.js`) — a shared Mongoose `toJSON` option object every model in later tasks uses to rename `_id` → `id` in JSON responses.

- [ ] **Step 1: Add the shared `id` transform helper**

`server/src/models/idTransform.js`:
```js
export const idTransform = {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};
```

- [ ] **Step 2: Write the Mongo connection module**

`server/src/db.js`:
```js
import mongoose from 'mongoose';

export async function connectMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scriptorium';
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Wire `server.js` to connect before listening**

Replace the full contents of `server/src/server.js`:
```js
import express from 'express';
import cors from 'cors';
import { connectMongo } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';

import worksRouter from './routes/works.js';
import chaptersRouter from './routes/chapters.js';
import codexRouter from './routes/codex.js';
import catchesRouter from './routes/catches.js';
import mapRouter from './routes/map.js';
import sessionsRouter from './routes/sessions.js';
import exportRouter from './routes/export.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'scriptorium-backend', time: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/works', worksRouter);
app.use('/api/works/:workId/chapters', chaptersRouter);
app.use('/api/works/:workId/codex', codexRouter);
app.use('/api/works/:workId/catches', catchesRouter);
app.use('/api/works/:workId/map', mapRouter);
app.use('/api/works/:workId/sessions', sessionsRouter);
app.use('/api/works/:workId/export', exportRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

async function start() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Scriptorium backend listening on http://localhost:${PORT}`);
  });
}

start();
```

Note: this removes the old `initDataDir()` filesystem bootstrap entirely — it's no longer needed since nothing reads/writes `data/` once every route is migrated. Routes in later tasks still import `fileService.js` until their own task lands; that's fine, `fileService.js` itself is untouched and still works until Task 10 deletes it.

- [ ] **Step 4: Update `server/package.json`**

Read the current file, then apply this dependency block (add `mongoose`, drop the unused `uuid`):
```json
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "mongoose": "^8.9.0",
    "dotenv": "^16.4.5",
    "@anthropic-ai/sdk": "^0.27.0",
    "openai": "^4.52.0",
    "pdfkit": "^0.15.0",
    "nodepub": "^3.2.1",
    "docx": "^8.5.0"
  }
```

- [ ] **Step 5: Add the `mongo` service to the dev Compose stack**

Replace the full contents of `docker-compose.yml`:
```yaml
services:
  mongo:
    image: mongo:8
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongo:27017/scriptorium
    volumes:
      - ./server/src:/app/src
    command: npm run dev
    depends_on:
      - mongo

  client:
    build: ./client
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=/api
    volumes:
      - ./client/src:/app/src
      - ./client/index.html:/app/index.html
    command: npm run dev
    depends_on:
      - server

volumes:
  mongo-data:
```

Note: the `./server/data:/app/data` bind mount is removed from `server` — nothing reads or writes that directory once the migration lands.

- [ ] **Step 6: Point production at the shared external Mongo network**

Replace the full contents of `docker-compose.prod.yml`:
```yaml
services:
  scriptorium-server:
    build:
      context: ./server
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    environment:
      - PORT=3001
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/scriptorium?replicaSet=rs0&directConnection=true
    networks:
      - default
      - shared-mongo
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 300M
        reservations:
          cpus: "0.1"
          memory: 128M

  scriptorium-client:
    build:
      context: ./client
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    depends_on:
      - scriptorium-server
    networks:
      - default
      - shared-edge
    deploy:
      resources:
        limits:
          cpus: "0.2"
          memory: 64M
        reservations:
          cpus: "0.05"
          memory: 24M

networks:
  shared-edge:
    external: true
  shared-mongo:
    external: true
```

- [ ] **Step 7: Install dependencies and start the dev stack**

Run:
```bash
wsl -d ubuntu -e docker-compose up -d --build
```
Leave this stack running for the rest of this plan — `server` runs `npm run dev` (`node --watch`), so every later task's code edits take effect automatically without rebuilding.

- [ ] **Step 8: Verify Mongo connected and the server is healthy**

Run:
```bash
wsl -d ubuntu -e docker-compose logs server --tail=20
```
Expected: a line reading `Connected to MongoDB` followed by `Scriptorium backend listening on http://localhost:3001`.

Run:
```bash
curl -s http://localhost:3001/api/health
```
Expected: `{"status":"ok","service":"scriptorium-backend","time":"..."}`.

- [ ] **Step 9: Commit**

```bash
git add server/src/db.js server/src/models/idTransform.js server/src/server.js server/package.json docker-compose.yml docker-compose.prod.yml
git commit -m "chore: add Mongo connection, mongoose dependency, and Compose services"
```

---

### Task 2: Work model and `works.js` route migration

**Files:**
- Create: `server/src/models/Work.js`
- Modify: `server/src/routes/works.js`

**Interfaces:**
- Consumes: `connectMongo()` from Task 1 (already wired into `server.js`).
- Produces: `Work` Mongoose model (default export from `server/src/models/Work.js`) with fields `_id, title, genre, tone, pov, protagonist, premise, status, wordCount, chapterCount, currentDraft, coverColor, logline, lastTouched, createdAt, updatedAt` — every later task that touches a work (`Chapter`, `Codex`, `Map`, `Catch`, `Session` routes, `wordCountService`, `exportService`) does `Work.findById(workId)` / `Work.findByIdAndUpdate(workId, {...})` against this model.

- [ ] **Step 1: Write the Work model**

`server/src/models/Work.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const workSchema = new mongoose.Schema(
  {
    _id: { type: String },
    title: { type: String, required: true },
    genre: { type: String, default: '' },
    tone: { type: String, default: '' },
    pov: { type: String, default: '' },
    protagonist: { type: String, default: '' },
    premise: { type: String, default: '' },
    status: { type: String, default: 'drafting' },
    wordCount: { type: Number, default: 0 },
    chapterCount: { type: Number, default: 0 },
    currentDraft: { type: Number, default: 1 },
    coverColor: { type: String, default: '' },
    logline: { type: String, default: '' },
    lastTouched: { type: String },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Work', workSchema);
```

- [ ] **Step 2: Rewrite `works.js` against Mongo**

Replace the full contents of `server/src/routes/works.js`. Note this also seeds an empty `Codex` and `Map` document per work (models land in Tasks 4 and 5, so these two `create()` calls are added now but only exercised once those models exist — until then, leave them commented out; see the inline note).

```js
import { Router } from 'express';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

const INDEX_FIELDS =
  'title genre status wordCount chapterCount currentDraft coverColor logline lastTouched createdAt';

// GET /api/works
router.get('/', async (req, res, next) => {
  try {
    const works = await Work.find().select(INDEX_FIELDS).sort({ createdAt: -1 });
    res.json(works);
  } catch (err) {
    next(err);
  }
});

// POST /api/works
router.post('/', async (req, res, next) => {
  try {
    const { title, genre, tone, pov, protagonist, premise } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const id = `work_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const work = await Work.create({
      _id: id,
      title,
      genre: genre || '',
      tone: tone || '',
      pov: pov || '',
      protagonist: protagonist || '',
      premise: premise || '',
      status: 'drafting',
      wordCount: 0,
      chapterCount: 0,
      currentDraft: 1,
      coverColor: randomCoverColor(),
      logline: '',
      lastTouched: now,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(work);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId
router.get('/:workId', async (req, res, next) => {
  try {
    const work = await Work.findById(req.params.workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(work);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId
router.put('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id;

    const updated = await Work.findByIdAndUpdate(workId, update, { new: true });
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId
router.delete('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const deleted = await Work.findByIdAndDelete(workId);
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function randomCoverColor() {
  const COVER_COLORS = ['#2d4a3e', '#3b2d4a', '#4a3b2d', '#2d3b4a', '#4a2d35', '#2d4a47'];
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

export default router;
```

This intentionally does not yet cascade-delete chapters/codex/map/catches/sessions on work deletion — that's added in Task 7 once all five sibling models exist.

- [ ] **Step 3: Verify against the running stack**

Run:
```bash
curl -s -X POST http://localhost:3001/api/works \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Novel","genre":"Fantasy"}'
```
Expected: `201` with a JSON body like `{"id":"work_xxxxx","title":"Test Novel","genre":"Fantasy",...,"wordCount":0,...}` (note `id`, not `_id`). Save the returned `id` as `$WORK_ID` for the next commands.

Run:
```bash
curl -s http://localhost:3001/api/works
```
Expected: an array containing one entry with `title: "Test Novel"` and no `content`/`draftHistory` fields (there are none on `Work` anyway — this just confirms the projection query works).

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID
```
Expected: the full work document.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"revising"}'
```
Expected: `status: "revising"` in the response, `updatedAt` changed.

Run:
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/works/nonexistent
```
Expected: `404`.

Keep `$WORK_ID`'s work around (don't delete it yet) — later tasks' verification steps reuse it.

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Work.js server/src/routes/works.js
git commit -m "feat(server): migrate works to MongoDB"
```

---

### Task 3: Chapter model, `wordCountService`, and `chapters.js` route migration

**Files:**
- Create: `server/src/models/Chapter.js`
- Modify: `server/src/services/wordCountService.js`
- Modify: `server/src/routes/chapters.js`

**Interfaces:**
- Consumes: `Work` model from Task 2.
- Produces: `Chapter` Mongoose model (default export from `server/src/models/Chapter.js`) with fields `_id, workId, number, title, order, content, wordCount, draftHistory[], status, notes, createdAt, lastEditedAt, updatedAt`. `recalculate(workId): Promise<number>` (exported from `wordCountService.js`) — Task 4's `consistencyService` does not depend on this, but Task 9's `exportService` and this task's own chapter routes both call it. `countWords(text): number` (unchanged signature, still exported from `wordCountService.js`).

- [ ] **Step 1: Write the Chapter model**

`server/src/models/Chapter.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const draftHistoryEntrySchema = new mongoose.Schema(
  {
    savedAt: { type: String },
    wordCount: { type: Number, default: 0 },
    contentSnapshot: { type: String },
  },
  { _id: false }
);

const chapterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    number: { type: Number },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
    content: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    draftHistory: { type: [draftHistoryEntrySchema], default: [] },
    status: { type: String, default: 'outline' },
    notes: { type: String, default: '' },
    createdAt: { type: String },
    lastEditedAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Chapter', chapterSchema);
```

- [ ] **Step 2: Rewrite `wordCountService.js` as an aggregation**

Replace the full contents of `server/src/services/wordCountService.js`:
```js
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
```

- [ ] **Step 3: Rewrite `chapters.js` against Mongo**

Replace the full contents of `server/src/routes/chapters.js`:
```js
import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';
import { countWords, recalculate } from '../services/wordCountService.js';

const router = Router({ mergeParams: true });

// GET /api/works/:workId/chapters
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const chapters = await Chapter.find({ workId }).select('-content -draftHistory').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { title, order } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const now = new Date().toISOString();
    const id = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const chapterCount = await Chapter.countDocuments({ workId });
    const chOrder = order !== undefined ? order : chapterCount;
    const number = chapterCount + 1;

    const chapter = await Chapter.create({
      _id: id,
      workId,
      number,
      title,
      order: chOrder,
      content: '',
      wordCount: 0,
      draftHistory: [],
      status: 'outline',
      notes: '',
      createdAt: now,
      lastEditedAt: now,
    });

    await Work.findByIdAndUpdate(workId, {
      chapterCount: chapterCount + 1,
      lastTouched: now,
      updatedAt: now,
    });

    res.status(201).json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /reorder — must be before /:chapterId to avoid route collision
router.put('/reorder', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return next(httpError(400, 'MISSING_FIELD', 'order array is required'));

    const ops = order.map((chapterId, pos) => ({
      updateOne: {
        filter: { _id: chapterId, workId },
        update: { $set: { order: pos } },
      },
    }));
    if (ops.length > 0) await Chapter.bulkWrite(ops);

    const chapters = await Chapter.find({ workId }).select('-content -draftHistory').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/chapters/:chapterId
router.get('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    res.json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/chapters/:chapterId
router.put('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const newContent = req.body.content !== undefined ? req.body.content : chapter.content;
    const words = countWords(newContent);
    const contentChanged = chapter.content !== undefined && chapter.content !== newContent;

    const setFields = { ...req.body, content: newContent, wordCount: words, updatedAt: now };
    delete setFields.id;
    delete setFields.workId;
    delete setFields.draftHistory;

    const updateOp = { $set: setFields };
    if (contentChanged) {
      updateOp.$push = {
        draftHistory: {
          $each: [{ savedAt: now, wordCount: chapter.wordCount || 0, contentSnapshot: chapter.content }],
          $slice: -10,
        },
      };
    }

    const updated = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, updateOp, { new: true });

    await recalculate(workId);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/chapters/:chapterId
router.delete('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const deleted = await Chapter.findOneAndDelete({ _id: chapterId, workId });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const chapterCount = await Chapter.countDocuments({ workId });
    await Work.findByIdAndUpdate(workId, { chapterCount, updatedAt: now });

    await recalculate(workId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

Note: the consistency scan call (`scan(workId, chapterId, newContent)`) is intentionally **not** included yet — `consistencyService.js` still reads/writes `codex.json` via `fileService` at this point in the plan and would throw on every chapter save. It's wired back in during Task 4, once `consistencyService.js` is migrated to Mongo alongside it.

- [ ] **Step 4: Verify against the running stack**

Using the `$WORK_ID` from Task 2:

Run:
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/chapters \
  -H 'Content-Type: application/json' \
  -d '{"title":"Chapter One"}'
```
Expected: `201` with `{"id":"ch_...","title":"Chapter One","order":0,"number":1,"wordCount":0,...}`. Save the returned `id` as `$CHAPTER_ID`.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/chapters/$CHAPTER_ID \
  -H 'Content-Type: application/json' \
  -d '{"content":"The quick brown fox jumps over the lazy dog."}'
```
Expected: `wordCount: 9`, `content` set.

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID
```
Expected: `wordCount: 9` on the work document (confirms the aggregation-based `recalculate` ran).

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID/chapters/$CHAPTER_ID
```
Expected: `draftHistory` has one entry with `contentSnapshot: ""` (the empty string that was there before this edit).

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/chapters/reorder \
  -H 'Content-Type: application/json' \
  -d "{\"order\":[\"$CHAPTER_ID\"]}"
```
Expected: `200` with the chapter index array, `order: 0`.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Chapter.js server/src/services/wordCountService.js server/src/routes/chapters.js
git commit -m "feat(server): migrate chapters and word-count recalculation to MongoDB"
```

---

### Task 4: Codex model, `consistencyService`, and `codex.js` route migration

**Files:**
- Create: `server/src/models/Codex.js`
- Modify: `server/src/services/consistencyService.js`
- Modify: `server/src/routes/codex.js`
- Modify: `server/src/routes/chapters.js:118-153` (re-add the consistency scan call)

**Interfaces:**
- Consumes: `Work` model from Task 2.
- Produces: `Codex` Mongoose model (default export from `server/src/models/Codex.js`) with fields `_id, workId, characters[], places[], worldRules[]` (each array holds loosely-typed entity objects — see schema). `scan(workId, chapterId, content): Promise<void>` (exported from `consistencyService.js`, now async) — called from `chapters.js`'s chapter-update route.

- [ ] **Step 1: Write the Codex model**

Entity subdocuments are intentionally schema-less (`strict: false`) because the app lets callers attach arbitrary fields to a character/place/rule (`role`, `aliases`, `affiliations`, `notes`, `physical`, etc. — see `codex-audit` in `ai.js`), matching today's flat-file behavior where any JSON shape is accepted.

`server/src/models/Codex.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const entitySchema = new mongoose.Schema({}, { strict: false, _id: false });

const codexSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true, unique: true },
    characters: { type: [entitySchema], default: [] },
    places: { type: [entitySchema], default: [] },
    worldRules: { type: [entitySchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Codex', codexSchema);
```

- [ ] **Step 2: Rewrite `consistencyService.js` against Mongo**

Replace the full contents of `server/src/services/consistencyService.js`:
```js
import Codex from '../models/Codex.js';

const TITLE_WORDS = ['Lady', 'Lord', 'Sir', 'Warden', 'General', 'Captain'];

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

export async function scan(workId, chapterId, content) {
  const codex = await Codex.findOne({ workId });
  if (!codex) return;

  for (const character of codex.characters || []) {
    const name = character.name;
    if (!name) continue;
    if (!content.includes(name)) continue;

    const regex = new RegExp(
      `(${TITLE_WORDS.join('|')})\\s+${escapeRegex(name)}|${escapeRegex(name)}\\s+(${TITLE_WORDS.join('|')})`,
      'gi'
    );
    const matches = [...content.matchAll(regex)];
    if (matches.length === 0) continue;

    const aliases = (character.aliases || []).map((a) => a.toLowerCase());

    for (const match of matches) {
      const titleWord = (match[1] || match[2] || '').trim();
      const titleWithName = `${titleWord} ${name}`;
      if (aliases.includes(titleWithName.toLowerCase())) continue;

      const alreadyFlagged = (character.flags || []).some(
        (f) => f.note && f.note.includes(titleWord)
      );
      if (alreadyFlagged) continue;

      const flag = {
        id: `flag_${shortId()}`,
        chapterId,
        note: `Title conflict: "${titleWithName}" found but not in aliases`,
        status: 'unresolved',
        createdAt: new Date().toISOString(),
      };

      await Codex.updateOne(
        { workId, 'characters.id': character.id },
        { $push: { 'characters.$.flags': flag } }
      );
      character.flags = [...(character.flags || []), flag];
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 3: Rewrite `codex.js` against Mongo**

Replace the full contents of `server/src/routes/codex.js`:
```js
import { Router } from 'express';
import Codex from '../models/Codex.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

async function getCodex(workId) {
  const codex = await Codex.findOne({ workId });
  return codex || { characters: [], places: [], worldRules: [] };
}

// GET /api/works/:workId/codex
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    res.json(await getCodex(workId));
  } catch (err) {
    next(err);
  }
});

// ─── Characters ───────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/characters
router.post('/characters', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `char_${shortId()}`;
    const character = { flags: [], aliases: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { characters: character }, $setOnInsert: { places: [], worldRules: [] } },
      { upsert: true }
    );
    res.status(201).json(character);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/characters/:charId
router.put('/characters/:charId', async (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const updated = { ...req.body, id: charId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`characters.$[c].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'characters.id': charId },
      { $set: setFields },
      { arrayFilters: [{ 'c.id': charId }] }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.characters.find((c) => c.id === charId));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/codex/characters/:charId
router.delete('/characters/:charId', async (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const result = await Codex.updateOne({ workId }, { $pull: { characters: { id: charId } } });
    if (result.matchedCount === 0 || result.modifiedCount === 0) {
      return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Places ───────────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/places
router.post('/places', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `place_${shortId()}`;
    const place = { flags: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { places: place }, $setOnInsert: { characters: [], worldRules: [] } },
      { upsert: true }
    );
    res.status(201).json(place);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/places/:placeId
router.put('/places/:placeId', async (req, res, next) => {
  try {
    const { workId, placeId } = req.params;
    const updated = { ...req.body, id: placeId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`places.$[p].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'places.id': placeId },
      { $set: setFields },
      { arrayFilters: [{ 'p.id': placeId }] }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Place not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.places.find((p) => p.id === placeId));
  } catch (err) {
    next(err);
  }
});

// ─── World Rules ──────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/rules
router.post('/rules', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `rule_${shortId()}`;
    const rule = { flags: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { worldRules: rule }, $setOnInsert: { characters: [], places: [] } },
      { upsert: true }
    );
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/rules/:ruleId
router.put('/rules/:ruleId', async (req, res, next) => {
  try {
    const { workId, ruleId } = req.params;
    const updated = { ...req.body, id: ruleId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`worldRules.$[r].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'worldRules.id': ruleId },
      { $set: setFields },
      { arrayFilters: [{ 'r.id': ruleId }] }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Rule not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.worldRules.find((r) => r.id === ruleId));
  } catch (err) {
    next(err);
  }
});

// ─── Flags ────────────────────────────────────────────────────────────────────

// GET /api/works/:workId/codex/flags
router.get('/flags', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const result = await Codex.aggregate([
      { $match: { workId } },
      {
        $project: {
          entries: {
            $concatArrays: [
              {
                $map: {
                  input: { $ifNull: ['$characters', []] },
                  as: 'e',
                  in: { entityType: 'character', entityId: '$$e.id', entityName: '$$e.name', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
              {
                $map: {
                  input: { $ifNull: ['$places', []] },
                  as: 'e',
                  in: { entityType: 'place', entityId: '$$e.id', entityName: '$$e.name', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
              {
                $map: {
                  input: { $ifNull: ['$worldRules', []] },
                  as: 'e',
                  in: { entityType: 'worldRule', entityId: '$$e.id', entityName: '$$e.rule', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
            ],
          },
        },
      },
      { $unwind: '$entries' },
      { $unwind: '$entries.flags' },
      { $match: { 'entries.flags.status': 'unresolved' } },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$entries.flags',
              { entityType: '$entries.entityType', entityId: '$entries.entityId', entityName: '$entries.entityName' },
            ],
          },
        },
      },
    ]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/flags/:flagId
router.put('/flags/:flagId', async (req, res, next) => {
  try {
    const { workId, flagId } = req.params;
    const updateBody = { ...req.body, id: flagId };
    const arrayNames = ['characters', 'places', 'worldRules'];

    for (const arrayName of arrayNames) {
      const setFields = Object.fromEntries(
        Object.entries(updateBody).map(([k, v]) => [`${arrayName}.$[e].flags.$[f].${k}`, v])
      );
      const result = await Codex.updateOne(
        { workId, [`${arrayName}.flags.id`]: flagId },
        { $set: setFields },
        { arrayFilters: [{ 'e.flags.id': flagId }, { 'f.id': flagId }] }
      );
      if (result.matchedCount > 0) {
        return res.json({ ok: true });
      }
    }

    next(httpError(404, 'NOT_FOUND', 'Flag not found'));
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 4: Re-add the consistency scan call to `chapters.js`**

In `server/src/routes/chapters.js`, add the import at the top:
```js
import { scan } from '../services/consistencyService.js';
```

And in the `PUT /:chapterId` handler, insert this block right after the `const updated = await Chapter.findOneAndUpdate(...)` line and before `await recalculate(workId);`:
```js
    try {
      await scan(workId, chapterId, newContent);
    } catch (scanErr) {
      console.error('Consistency scan error:', scanErr);
    }
```

- [ ] **Step 5: Verify against the running stack**

Using `$WORK_ID`:

Run:
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/codex/characters \
  -H 'Content-Type: application/json' \
  -d '{"name":"Elara","aliases":["Lady Elara"]}'
```
Expected: `201` with `{"id":"char_...","name":"Elara","aliases":["Lady Elara"],"flags":[],...}`. Save `id` as `$CHAR_ID`.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/codex/characters/$CHAR_ID \
  -H 'Content-Type: application/json' \
  -d '{"notes":"Protagonist"}'
```
Expected: `notes: "Protagonist"`, `name` still `"Elara"` (confirms `arrayFilters` targeted the right element and didn't drop sibling fields).

Run (this should trigger `consistencyService.scan` via the chapter route from Task 3, flagging an unlisted title+name combo):
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/chapters \
  -H 'Content-Type: application/json' -d '{"title":"Ch Two"}'
```
Save the new chapter's `id` as `$CHAPTER_ID_2`, then:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/chapters/$CHAPTER_ID_2 \
  -H 'Content-Type: application/json' \
  -d '{"content":"General Elara walked into the hall."}'
```
Expected: `200`, chapter saved successfully (no error — confirms `scan` ran without throwing).

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID/codex/flags
```
Expected: an array with one entry, `entityType: "character"`, `entityId: "$CHAR_ID"`, `note` containing `"General Elara"`, `status: "unresolved"`. Save its `id` as `$FLAG_ID`.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/codex/flags/$FLAG_ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"resolved"}'
```
Expected: `{"ok":true}`.

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID/codex/flags
```
Expected: `[]` (the flag is now `resolved`, filtered out).

- [ ] **Step 6: Commit**

```bash
git add server/src/models/Codex.js server/src/services/consistencyService.js server/src/routes/codex.js server/src/routes/chapters.js
git commit -m "feat(server): migrate codex and consistency scanning to MongoDB"
```

---

### Task 5: Map model and `map.js` route migration

**Files:**
- Create: `server/src/models/Map.js`
- Modify: `server/src/routes/map.js`

**Interfaces:**
- Consumes: `Work` model from Task 2.
- Produces: `Map` Mongoose model (default export from `server/src/models/Map.js`) with fields `_id, workId, framework, acts[], chapters (Mixed object keyed by chapterId), keyBeats[], missingBeats[]`.

- [ ] **Step 1: Write the Map model**

`server/src/models/Map.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const beatEntrySchema = new mongoose.Schema({}, { strict: false, _id: false });

const mapSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true, unique: true },
    framework: { type: String, default: '' },
    acts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    chapters: { type: mongoose.Schema.Types.Mixed, default: {} },
    keyBeats: { type: [mongoose.Schema.Types.Mixed], default: [] },
    missingBeats: { type: [beatEntrySchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Map', mapSchema);
```

- [ ] **Step 2: Rewrite `map.js` against Mongo**

Replace the full contents of `server/src/routes/map.js`:
```js
import { Router } from 'express';
import MapModel from '../models/Map.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

async function getMap(workId) {
  const map = await MapModel.findOne({ workId });
  return map || { framework: '', acts: [], chapters: {}, keyBeats: [], missingBeats: [] };
}

// GET /api/works/:workId/map
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(await getMap(workId));
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map
router.put('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { framework, acts, keyBeats } = req.body;
    const setFields = {};
    if (framework !== undefined) setFields.framework = framework;
    if (acts !== undefined) setFields.acts = acts;
    if (keyBeats !== undefined) setFields.keyBeats = keyBeats;

    const map = await MapModel.findOneAndUpdate(
      { workId },
      { $set: setFields, $setOnInsert: { chapters: {}, missingBeats: [] } },
      { upsert: true, new: true }
    );
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/chapters/:chapterId
router.put('/chapters/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const now = new Date().toISOString();
    const map = await MapModel.findOneAndUpdate(
      { workId },
      [
        {
          $set: {
            [`chapters.${chapterId}`]: {
              $mergeObjects: [
                { $ifNull: [`$chapters.${chapterId}`, {}] },
                { ...req.body, chapterId, updatedAt: now },
              ],
            },
            framework: { $ifNull: ['$framework', ''] },
            acts: { $ifNull: ['$acts', []] },
            keyBeats: { $ifNull: ['$keyBeats', []] },
            missingBeats: { $ifNull: ['$missingBeats', []] },
            workId: { $ifNull: ['$workId', workId] },
          },
        },
      ],
      { upsert: true, new: true }
    );
    res.json(map.chapters[chapterId]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/gaps/:gapId
router.put('/gaps/:gapId', async (req, res, next) => {
  try {
    const { workId, gapId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const updated = { ...req.body, id: gapId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`missingBeats.$[g].${k}`, v])
    );
    const result = await MapModel.updateOne(
      { workId, 'missingBeats.id': gapId },
      { $set: setFields },
      { arrayFilters: [{ 'g.id': gapId }] }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Gap not found'));

    const map = await MapModel.findOne({ workId });
    res.json(map.missingBeats.find((g) => g.id === gapId));
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 3: Verify against the running stack**

Using `$WORK_ID`:

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/map \
  -H 'Content-Type: application/json' \
  -d '{"framework":"Three-act structure","acts":["Act I","Act II","Act III"]}'
```
Expected: `200` with `framework` and `acts` set, `chapters: {}`, `missingBeats: []`.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/map/chapters/$CHAPTER_ID \
  -H 'Content-Type: application/json' \
  -d '{"beat":"Inciting incident","tensionScore":6}'
```
Expected: `200` with `{"beat":"Inciting incident","tensionScore":6,"chapterId":"$CHAPTER_ID","updatedAt":"..."}`.

Run again with a different field, to confirm the merge (not overwrite) behavior of the pipeline update:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/map/chapters/$CHAPTER_ID \
  -H 'Content-Type: application/json' \
  -d '{"tensionScore":8}'
```
Expected: `{"beat":"Inciting incident","tensionScore":8,...}` — `beat` is still present even though this request only sent `tensionScore`.

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID/map
```
Expected: `chapters` object contains the `$CHAPTER_ID` entry with `tensionScore: 8`.

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Map.js server/src/routes/map.js
git commit -m "feat(server): migrate story map to MongoDB"
```

---

### Task 6: Catch model and `catches.js` route migration

**Files:**
- Create: `server/src/models/Catch.js`
- Modify: `server/src/routes/catches.js`

**Interfaces:**
- Consumes: `Work` model from Task 2.
- Produces: `Catch` Mongoose model (default export from `server/src/models/Catch.js`) with fields `_id, workId, content, capturedDuringChapterId, taggedChapterId, status, createdAt, updatedAt`.

- [ ] **Step 1: Write the Catch model**

`server/src/models/Catch.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const catchSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    capturedDuringChapterId: { type: String, default: null },
    taggedChapterId: { type: String, default: null },
    status: { type: String, default: 'open' },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Catch', catchSchema);
```

- [ ] **Step 2: Rewrite `catches.js` against Mongo**

Replace the full contents of `server/src/routes/catches.js`:
```js
import { Router } from 'express';
import CatchModel from '../models/Catch.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/catches
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const filter = { workId };
    if (req.query.status) filter.status = req.query.status;

    const catches = await CatchModel.find(filter).sort({ createdAt: 1 });
    res.json(catches);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/catches
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { content, capturedDuringChapterId, taggedChapterId } = req.body;
    if (!content) return next(httpError(400, 'MISSING_FIELD', 'content is required'));

    const now = new Date().toISOString();
    const catchItem = await CatchModel.create({
      _id: `catch_${shortId()}`,
      workId,
      content,
      capturedDuringChapterId: capturedDuringChapterId || null,
      taggedChapterId: taggedChapterId || null,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(catchItem);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/catches/:catchId
router.put('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id;
    delete update.workId;

    const updated = await CatchModel.findOneAndUpdate({ _id: catchId, workId }, { $set: update }, { new: true });
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/catches/:catchId
router.delete('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const deleted = await CatchModel.findOneAndDelete({ _id: catchId, workId });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 3: Verify against the running stack**

Using `$WORK_ID`:

Run:
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/catches \
  -H 'Content-Type: application/json' \
  -d '{"content":"Remember to plant the ring earlier"}'
```
Expected: `201` with `status: "open"`. Save `id` as `$CATCH_ID`.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/catches/$CATCH_ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"resolved"}'
```
Expected: `status: "resolved"`.

Run:
```bash
curl -s "http://localhost:3001/api/works/$WORK_ID/catches?status=resolved"
```
Expected: array containing the one catch.

Run:
```bash
curl -s "http://localhost:3001/api/works/$WORK_ID/catches?status=open"
```
Expected: `[]` (confirms the query-based status filter works).

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Catch.js server/src/routes/catches.js
git commit -m "feat(server): migrate catches to MongoDB"
```

---

### Task 7: Session model, `sessions.js` route migration, and work cascade delete

**Files:**
- Create: `server/src/models/Session.js`
- Modify: `server/src/routes/sessions.js`
- Modify: `server/src/routes/works.js` (add cascade delete now that all sibling models exist)

**Interfaces:**
- Consumes: `Work`, `Chapter`, `Codex`, `Map`, `Catch` models from Tasks 2–6.
- Produces: `Session` Mongoose model (default export from `server/src/models/Session.js`) with fields `_id, workId, chapterId, wordsAtStart, wordsAtEnd, wordsWritten, rekindlerSnapshot, startedAt, endedAt`.

- [ ] **Step 1: Write the Session model**

`server/src/models/Session.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    chapterId: { type: String, default: null },
    wordsAtStart: { type: Number, default: 0 },
    wordsAtEnd: { type: Number, default: null },
    wordsWritten: { type: Number, default: null },
    rekindlerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: String },
    endedAt: { type: String, default: null },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Session', sessionSchema);
```

- [ ] **Step 2: Rewrite `sessions.js` against Mongo**

Replace the full contents of `server/src/routes/sessions.js`:
```js
import { Router } from 'express';
import Session from '../models/Session.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/sessions/latest
router.get('/latest', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const latest = await Session.findOne({ workId }).sort({ startedAt: -1 });
    res.json(latest || null);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/sessions
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { chapterId, wordsAtStart, rekindlerSnapshot } = req.body;
    const now = new Date().toISOString();

    const session = await Session.create({
      _id: `sess_${shortId()}`,
      workId,
      chapterId: chapterId || null,
      wordsAtStart: wordsAtStart || 0,
      wordsAtEnd: null,
      wordsWritten: null,
      rekindlerSnapshot: rekindlerSnapshot || null,
      startedAt: now,
      endedAt: null,
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/sessions/:sessionId/end
router.put('/:sessionId/end', async (req, res, next) => {
  try {
    const { workId, sessionId } = req.params;
    const { wordsAtEnd } = req.body;
    const now = new Date().toISOString();

    const session = await Session.findOne({ _id: sessionId, workId });
    if (!session) return next(httpError(404, 'NOT_FOUND', 'Session not found'));

    const wordsWritten = (wordsAtEnd || 0) - (session.wordsAtStart || 0);
    const updated = await Session.findOneAndUpdate(
      { _id: sessionId, workId },
      { $set: { wordsAtEnd: wordsAtEnd || 0, wordsWritten, endedAt: now } },
      { new: true }
    );

    await Work.findByIdAndUpdate(workId, { lastTouched: now, updatedAt: now });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 3: Add cascade delete to `works.js`**

In `server/src/routes/works.js`, add these imports at the top:
```js
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import CatchModel from '../models/Catch.js';
import Session from '../models/Session.js';
```

Replace the `DELETE /:workId` handler with:
```js
// DELETE /api/works/:workId
router.delete('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const deleted = await Work.findByIdAndDelete(workId);
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    await Promise.all([
      Chapter.deleteMany({ workId }),
      Codex.deleteMany({ workId }),
      MapModel.deleteMany({ workId }),
      CatchModel.deleteMany({ workId }),
      Session.deleteMany({ workId }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Verify against the running stack**

Using `$WORK_ID`:

Run:
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/sessions \
  -H 'Content-Type: application/json' \
  -d '{"chapterId":"'$CHAPTER_ID'","wordsAtStart":9}'
```
Expected: `201`, `wordsAtStart: 9`, `endedAt: null`. Save `id` as `$SESSION_ID`.

Run:
```bash
curl -s http://localhost:3001/api/works/$WORK_ID/sessions/latest
```
Expected: the session just created.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/works/$WORK_ID/sessions/$SESSION_ID/end \
  -H 'Content-Type: application/json' \
  -d '{"wordsAtEnd":45}'
```
Expected: `wordsWritten: 36`, `endedAt` set.

Now verify cascade delete — create a throwaway work with a chapter, catch, and codex character, then delete the work:
```bash
curl -s -X POST http://localhost:3001/api/works -H 'Content-Type: application/json' -d '{"title":"Throwaway"}'
```
Save its `id` as `$TMP_WORK_ID`, then:
```bash
curl -s -X POST http://localhost:3001/api/works/$TMP_WORK_ID/chapters -H 'Content-Type: application/json' -d '{"title":"X"}'
curl -s -X POST http://localhost:3001/api/works/$TMP_WORK_ID/catches -H 'Content-Type: application/json' -d '{"content":"X"}'
curl -s -X DELETE http://localhost:3001/api/works/$TMP_WORK_ID
curl -s http://localhost:3001/api/works/$TMP_WORK_ID/chapters
```
Expected: the last command returns `404` (work gone) rather than a lingering chapter list — confirms `Work.findById` inside the chapters route 404s correctly and, more importantly, run:
```bash
wsl -d ubuntu -e docker-compose exec mongo mongosh scriptorium --eval "db.chapters.countDocuments({workId: '$TMP_WORK_ID'})"
```
Expected: `0` (the chapter document was actually deleted, not just orphaned).

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Session.js server/src/routes/sessions.js server/src/routes/works.js
git commit -m "feat(server): migrate sessions to MongoDB and cascade-delete work children"
```

---

### Task 8: Settings model and `settingsService`/`settings.js`/`llmService` migration

**Files:**
- Create: `server/src/models/Settings.js`
- Modify: `server/src/services/settingsService.js`
- Modify: `server/src/routes/settings.js`
- Modify: `server/src/services/llmService.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getSettings(): Promise<object>`, `saveSettings(partial): Promise<object>` (both now async, exported from `settingsService.js` — same names/shapes as before, every caller must add `await`). `maskSettings(settings): object` stays synchronous (pure function, unchanged).

- [ ] **Step 1: Write the Settings model**

`server/src/models/Settings.js`:
```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },
    activeProvider: { type: String, default: 'anthropic' },
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },
    generation: { type: mongoose.Schema.Types.Mixed, default: {} },
    autoFeatures: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Settings', settingsSchema);
```

- [ ] **Step 2: Rewrite `settingsService.js` against Mongo**

Replace the full contents of `server/src/services/settingsService.js`:
```js
import Settings from '../models/Settings.js';

const SETTINGS_ID = 'singleton';

const DEFAULT_SETTINGS = {
  activeProvider: 'anthropic',
  providers: {
    anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
    openai: { apiKey: '', model: 'gpt-4o' },
  },
  generation: { maxTokens: 1000, temperature: 0.7 },
  autoFeatures: { rekindler: 'prompt' },
};

export async function getSettings() {
  const stored = await Settings.findById(SETTINGS_ID).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  return deepMerge(structuredClone(DEFAULT_SETTINGS), rest);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const merged = deepMerge(current, partial);
  merged.updatedAt = new Date().toISOString();
  await Settings.findByIdAndUpdate(SETTINGS_ID, merged, { upsert: true, new: true });
  return merged;
}

export function maskSettings(settings) {
  const masked = structuredClone(settings);
  for (const [id, provider] of Object.entries(masked.providers)) {
    const key = provider.apiKey || '';
    masked.providers[id] = {
      ...provider,
      apiKey: undefined,
      hasKey: key.length > 0,
      keyPreview:
        key.length > 12
          ? key.slice(0, 8) + '…' + key.slice(-4)
          : key.length > 0
          ? key.slice(0, 4) + '…'
          : null,
    };
    delete masked.providers[id].apiKey;
  }
  return masked;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      out[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
```

- [ ] **Step 3: Await `getSettings`/`saveSettings` in `settings.js`**

In `server/src/routes/settings.js`, apply these changes:

Replace the `GET /` handler:
```js
// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    res.json(maskSettings(await getSettings()));
  } catch (err) {
    next(err);
  }
});
```

In the `PUT /` handler, change `router.put('/', (req, res, next) => {` to `router.put('/', async (req, res, next) => {`, and change these two lines:
```js
    const settings = getSettings();
```
to:
```js
    const settings = await getSettings();
```
and:
```js
    const updated = saveSettings(partial);
```
to:
```js
    const updated = await saveSettings(partial);
```

In the `POST /models` handler, change `const settings = getSettings();` to `const settings = await getSettings();` (the handler is already `async`).

In the `POST /test` handler, change `const settings = getSettings();` to `const settings = await getSettings();` (already `async`).

- [ ] **Step 4: Await `getSettings` in `llmService.js`**

In `server/src/services/llmService.js`, change:
```js
export async function complete({ system, prompt, maxTokensOverride } = {}) {
  const settings = getSettings();
```
to:
```js
export async function complete({ system, prompt, maxTokensOverride } = {}) {
  const settings = await getSettings();
```

- [ ] **Step 5: Verify against the running stack**

Run:
```bash
curl -s http://localhost:3001/api/settings
```
Expected: `200` with `activeProvider: "anthropic"`, `providers.anthropic.hasKey: false`, no `apiKey` field present anywhere.

Run:
```bash
curl -s -X PUT http://localhost:3001/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"providers":{"anthropic":{"apiKey":"sk-test-1234567890"}}}'
```
Expected: `hasKey: true`, `keyPreview` shows a masked preview, no raw `apiKey`.

Run:
```bash
curl -s http://localhost:3001/api/settings
```
Expected: `hasKey: true` persists (confirms the singleton document actually saved).

Run:
```bash
curl -s http://localhost:3001/api/settings/providers
```
Expected: `[{"id":"anthropic","label":"Anthropic"},{"id":"openai","label":"OpenAI"}]`.

- [ ] **Step 6: Commit**

```bash
git add server/src/models/Settings.js server/src/services/settingsService.js server/src/routes/settings.js server/src/services/llmService.js
git commit -m "feat(server): migrate settings singleton to MongoDB"
```

---

### Task 9: `exportService` and remaining `ai.js` migration

**Files:**
- Modify: `server/src/services/exportService.js:1-24`
- Modify: `server/src/routes/ai.js:1-2` (imports)
- Modify: `server/src/routes/ai.js:114-158` (pacing handler)
- Modify: `server/src/routes/ai.js:312-350` (codex-audit handler)

**Interfaces:**
- Consumes: `Work`, `Chapter`, `Map`, `Codex` models from Tasks 2, 3, 5, 4.
- Produces: nothing new — this is the last task touching `fileService.js` call sites before it's deleted in Task 10.

- [ ] **Step 1: Rewrite `exportService.js`'s data-fetch section**

In `server/src/services/exportService.js`, replace the top of the file (imports through the start of `exportWork`) — everything up to and including line 24 (`}`) — with:
```js
import PDFDocument from 'pdfkit';
import nodepub from 'nodepub';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';

export async function exportWork(workId, format, options = {}) {
  const meta = await Work.findById(workId);
  if (!meta) {
    throw Object.assign(new Error('Work not found'), { status: 404, code: 'NOT_FOUND' });
  }

  const chapterDocs = await Chapter.find({ workId }).sort({ order: 1 }).lean();
  const chapters = chapterDocs.map((ch) => ({
    title: ch.title || 'Untitled',
    content: ch.content || '',
  }));

  switch (format) {
    case 'pdf':
      return buildPDF(meta, chapters);
    case 'epub':
      return buildEPUB(meta, chapters);
    case 'docx':
      return buildDOCX(meta, chapters);
    default:
      throw Object.assign(new Error(`Unsupported format: ${format}`), {
        status: 400,
        code: 'UNSUPPORTED_FORMAT',
      });
  }
}
```
Everything below this point in the file (`buildPDF`, `buildEPUB`, `buildDOCX`, `textToHTML`) is unchanged — leave it as-is.

- [ ] **Step 2: Update `ai.js` imports**

In `server/src/routes/ai.js`, replace:
```js
import { readJSON } from '../services/fileService.js';
```
with:
```js
import Chapter from '../models/Chapter.js';
import MapModel from '../models/Map.js';
import Codex from '../models/Codex.js';
```

- [ ] **Step 3: Migrate the pacing handler**

In `server/src/routes/ai.js`, inside `router.post('/pacing', async (req, res, next) => { try {`, replace:
```js
    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const map = readJSON(`works/${workId}/map.json`) || {};
```
with:
```js
    const chapters = await Chapter.find({ workId }).select('-content -draftHistory').sort({ order: 1 });
    const map = (await MapModel.findOne({ workId }).lean()) || {};
```

- [ ] **Step 4: Migrate the codex-audit handler**

In `server/src/routes/ai.js`, inside `router.post('/codex-audit', async (req, res, next) => { try {`, replace:
```js
    const codex = readJSON(`works/${workId}/codex.json`) || { characters: [], places: [], worldRules: [] };
```
with:
```js
    const codex = (await Codex.findOne({ workId }).lean()) || { characters: [], places: [], worldRules: [] };
```

- [ ] **Step 5: Verify against the running stack**

Using `$WORK_ID`:

Run:
```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/export \
  -H 'Content-Type: application/json' \
  -d '{"format":"pdf"}' -o /tmp/export-test.pdf -w '%{http_code}\n'
```
Expected: `200`, and `file /tmp/export-test.pdf` (or just checking its size) shows a non-trivial PDF file (confirms `Work`/`Chapter` Mongo reads feed the export pipeline correctly).

Run:
```bash
curl -s -X POST http://localhost:3001/api/ai/pacing \
  -H 'Content-Type: application/json' -d '{"workId":"'$WORK_ID'"}'
```
Expected: `400` with `code: "NO_API_KEY"` (no real LLM key is configured in this environment) — this confirms the handler successfully read chapters/map from Mongo and reached the LLM call, rather than erroring out on a missing/undefined data shape.

Run:
```bash
curl -s -X POST http://localhost:3001/api/ai/codex-audit \
  -H 'Content-Type: application/json' -d '{"workId":"'$WORK_ID'"}'
```
Expected: `400` with `code: "NO_API_KEY"`, same reasoning — confirms the Codex Mongo read succeeded.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/exportService.js server/src/routes/ai.js
git commit -m "feat(server): migrate export and remaining AI context reads to MongoDB"
```

---

### Task 10: Remove `fileService.js`, final cleanup, and documentation

**Files:**
- Delete: `server/src/services/fileService.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing — this is the final task, run only once every route/service file has been migrated in Tasks 1–9.
- Produces: nothing further downstream.

- [ ] **Step 1: Confirm nothing still imports `fileService.js`**

Run:
```bash
grep -rn "fileService" server/src --include="*.js"
```
Expected: only `server/src/services/fileService.js` itself matches (no importers left). If any importer shows up, stop and fix that file before continuing — it means an earlier task's migration was missed.

- [ ] **Step 2: Delete the file service**

```bash
rm server/src/services/fileService.js
```

- [ ] **Step 3: Restart and verify the whole stack still boots clean**

Run:
```bash
wsl -d ubuntu -e docker-compose restart server
wsl -d ubuntu -e docker-compose logs server --tail=20
```
Expected: `Connected to MongoDB` and `Scriptorium backend listening on http://localhost:3001`, no import errors.

Run a final smoke pass across every resource type using `$WORK_ID`:
```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/works
curl -s http://localhost:3001/api/works/$WORK_ID/chapters
curl -s http://localhost:3001/api/works/$WORK_ID/codex
curl -s http://localhost:3001/api/works/$WORK_ID/map
curl -s http://localhost:3001/api/works/$WORK_ID/catches
curl -s http://localhost:3001/api/works/$WORK_ID/sessions/latest
curl -s http://localhost:3001/api/settings
```
Expected: every call returns `200` with valid JSON, no `500`s.

- [ ] **Step 4: Update `CLAUDE.md`**

In `CLAUDE.md`, replace:
```
Stack: React 18 + Vite (client) · Express.js + JSON flat files (server) ·
Provider-agnostic LLM layer (Anthropic/OpenAI) · pdfkit/nodepub/docx (export).
```
with:
```
Stack: React 18 + Vite (client) · Express.js + MongoDB/Mongoose (server) ·
Provider-agnostic LLM layer (Anthropic/OpenAI) · pdfkit/nodepub/docx (export).
```

Replace:
```
# Everything (recommended)
wsl -d ubuntu -e docker-compose up --build

# Server only (from server/)
wsl -d ubuntu -e sh -c "cd server && npm install && npm run dev"    # http://localhost:3001
```
with:
```
# Everything (recommended) — starts mongo, server, client
wsl -d ubuntu -e docker-compose up --build

# Server only (from server/, needs MONGODB_URI pointed at a running Mongo)
wsl -d ubuntu -e sh -c "cd server && npm install && npm run dev"    # http://localhost:3001
```

In the Structure diagram, replace:
```
│   ├── package.json            # ESM; express, uuid, @anthropic-ai/sdk, openai, pdfkit, nodepub, docx
│   └── src/
│       ├── server.js           # Express entry — mounts all /api/* routers
│       ├── middleware/errorHandler.js
│       ├── services/           # fileService, settingsService, llmService, consistencyService, exportService, wordCountService
```
with:
```
│   ├── package.json            # ESM; express, mongoose, @anthropic-ai/sdk, openai, pdfkit, nodepub, docx
│   └── src/
│       ├── server.js           # Express entry — connects Mongo, mounts all /api/* routers
│       ├── db.js                # Mongo connection
│       ├── models/             # Work, Chapter, Codex, Map, Catch, Session, Settings (Mongoose schemas)
│       ├── middleware/errorHandler.js
│       ├── services/           # settingsService, llmService, consistencyService, exportService, wordCountService
```

Replace the `data/` bullet:
```
- `data/` is gitignored and bind-mounted into the server container. It does
  not exist until the server first writes to it.
```
with:
```
- Data is stored in MongoDB, connected via `MONGODB_URI` (set per-environment
  in Docker Compose). Dev runs its own `mongo` container; production joins the
  external `shared-mongo` network under a dedicated `scriptorium` database.
```

- [ ] **Step 5: Commit**

```bash
git add server/src/services/fileService.js CLAUDE.md
git commit -m "chore: remove file-based storage service, update docs for MongoDB"
```
