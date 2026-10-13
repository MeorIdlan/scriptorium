# Plot-thread tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the writer set and clear plot-thread tags on scenes and chapters, with tags surviving save, moves, snapshot restore and chapter bring-back, and showing as coloured markers in the Scenes tab.

**Architecture:** Scene tags stay in `data-threads` on the scene marker; chapter tags stay in `Chapter.threadIds`, written through a new dedicated endpoint (the autosave PUT keeps ignoring `threadIds`). Every server path that writes tags or chapter HTML filters ids to the work's current threads. Snapshots gain `threadIds` so chapter tags come back with a restored or recreated chapter. The client adds a chip strip (chapter) and chips in the scene card form, plus markers on scene rows.

**Tech Stack:** Express + Mongoose, `node --test`, supertest + in-memory MongoDB (server); React 18, linkedom tests (client).

**Spec:** `docs/superpowers/specs/2026-10-13-plot-thread-tagging-design.md`

## Global Constraints

- Thread ids match `^thr_[A-Za-z0-9_]{1,60}$`; at most 50 tags per scene or chapter (`THREAD_ID`, `MAX_TAGS` in `server/src/services/threadTags.js`).
- The autosave `PUT /chapters/:id` keeps dropping `threadIds` from its body.
- `applyCard` only changes `data-threads` when `'threadIds' in fields`.
- Tagging a chapter must not change `lastEditedAt`/`updatedAt` (`timestamps: false`).
- Every work-scoped route sits behind `loadWork`.
- Server and client are ESM. Server DB tests run in WSL (`cd server && npm test`); client tests: `cd client && npm test`. No linter exists.
- Commits: Conventional Commits, ≤72 chars, body ends with `Trello: https://trello.com/c/N9pF3I1q/24-tag-scenes-and-chapters-with-plot-threads` and the `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` line.
- Work only in `/home/meor/workspace/scriptorium-N9pF3I1q`.

## Review Focus

- Tag request body that isn't an array, holds non-strings, or has a bad id → 400, nothing written.
- A thread deleted while the editor still has its id in HTML or a pending request → stray id dropped on save, on the tag endpoint, on restore and on bring-back, never an error.
- A snapshot taken before this change (no `threadIds` field) → restoring it leaves the live chapter's tags alone; bringing the chapter back gives no chapter tags.
- Restoring a snapshot whose tagged thread was deleted since → the id doesn't come back (chapter tags or scene markers).
- A work with no threads, or a chapter with no scene breaks → the Scenes tab still lets the writer tag the chapter / shows a hint, and no marker renders for unknown ids.
- A non-array `threadIds` handed to `markerHtml`/`applyCard` → no crash, no tags written.

---

## File Structure

- `server/src/services/threadTags.js` (modify): `checkTagList`, `filterHtmlThreads`.
- `server/src/services/threadScope.js` (create): `knownThreadSet(workId)`.
- `server/src/routes/chapters.js` (modify): tag endpoint; filter in chapter PUT and `writeMovedChapter`.
- `server/src/models/Snapshot.js`, `server/src/services/snapshotData.js`, `server/src/services/snapshotService.js`, `server/src/routes/milestones.js` (modify): snapshots carry and restore chapter tags.
- `server/test/support/http.js` (modify): mount snapshot and milestone routers.
- Server tests: `threadTags.test.js`, `chapterThreadIds.test.js`, `snapshotData.test.js` (modify); `threadSurvival.test.js` (create).
- `client/src/utils/threads.js`, `client/src/utils/scenes.js` (modify): tag helpers, safe join.
- `client/src/components/panel/ThreadChips.jsx` (create): `ThreadChips`, `ThreadMarkers`, `ChapterThreads`.
- `client/src/components/panel/SceneRow.jsx`, `ScenesTab.jsx`, `client/src/components/map/ThreadManager.jsx`, `client/src/pages/MapView.jsx`, `client/src/index.css` (modify).
- Client tests: `sceneThreads.test.js`, `threadManager.test.js` (modify); `threadChips.test.js` (create).

---

### Task 1: Tag helpers and known-thread scope

→ S1

**Files:**
- Modify: `server/src/services/threadTags.js`
- Create: `server/src/services/threadScope.js`
- Test: `server/test/threadTags.test.js`

**Interfaces:**
- Produces: `checkTagList(value) → { ok: true, ids: string[] } | { ok: false, message: string }`; `filterHtmlThreads(html, knownSet) → string`; `knownThreadSet(workId) → Promise<Set<string>>`.

- [ ] **Step 1: Write the failing tests** (append to `server/test/threadTags.test.js`; add `checkTagList, filterHtmlThreads` to its import from `../src/services/threadTags.js`)

```js
test('checkTagList accepts a list of valid ids and dedupes it', () => {
  assert.deepEqual(checkTagList(['thr_a', 'thr_b', 'thr_a']), { ok: true, ids: ['thr_a', 'thr_b'] });
  assert.deepEqual(checkTagList([]), { ok: true, ids: [] });
});

test('checkTagList refuses anything else', () => {
  for (const bad of [undefined, null, 'thr_a', {}, [1], [{ a: 1 }], ['thr_a', 'bad id'], ['javascript:x']]) {
    assert.equal(checkTagList(bad).ok, false, JSON.stringify(bad));
  }
  const many = Array.from({ length: 51 }, (_, i) => `thr_${i}`);
  assert.equal(checkTagList(many).ok, false);
  assert.equal(checkTagList(many.slice(0, 50)).ok, true);
});

test('filterHtmlThreads keeps only known ids on markers and nothing else changes', () => {
  const html = '<hr data-scene="scn_1" data-threads="thr_a thr_gone thr_b" data-status="draft"><div>One thr_gone.</div><hr data-scene="scn_2" data-threads="thr_gone" data-status="draft"><div>Two.</div>';
  const out = filterHtmlThreads(html, new Set(['thr_a', 'thr_b']));
  assert.equal(out, '<hr data-scene="scn_1" data-threads="thr_a thr_b" data-status="draft"><div>One thr_gone.</div><hr data-scene="scn_2" data-status="draft"><div>Two.</div>');
  assert.equal(filterHtmlThreads('<div>No markers.</div>', new Set()), '<div>No markers.</div>');
  assert.equal(filterHtmlThreads('', new Set()), '');
});
```

- [ ] **Step 2: Run to verify failure**

Run (WSL): `cd server && node --test test/threadTags.test.js`
Expected: FAIL, `checkTagList`/`filterHtmlThreads` are not exported.

- [ ] **Step 3: Implement**

Append to `server/src/services/threadTags.js`:

```js
// Validates a tag list sent by a client. A clean list comes back deduped.
export function checkTagList(value) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    return { ok: false, message: 'threadIds must be an array of thread ids' };
  }
  if (value.some((id) => !THREAD_ID.test(id))) {
    return { ok: false, message: 'threadIds contains an invalid thread id' };
  }
  const ids = [...new Set(value)];
  if (ids.length > MAX_TAGS) return { ok: false, message: `At most ${MAX_TAGS} thread tags are allowed` };
  return { ok: true, ids };
}

// Drops ids that aren't current threads from scene markers; the rest of the HTML is untouched
export function filterHtmlThreads(html, known) {
  if (typeof html !== 'string' || !html) return html;
  return html.replace(MARKER_THREADS, (match, before, list) => {
    const kept = list.split(/\s+/).filter((id) => id && known.has(id));
    return kept.length ? `${before} data-threads="${kept.join(' ')}"` : before;
  });
}
```

Create `server/src/services/threadScope.js`:

```js
// The ids of a work's current plot threads: the set tags are filtered against
import PlotThread from '../models/PlotThread.js';

export async function knownThreadSet(workId) {
  const rows = await PlotThread.find({ workId }).select('_id').lean();
  return new Set(rows.map((r) => r._id));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && node --test test/threadTags.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/threadTags.js server/src/services/threadScope.js server/test/threadTags.test.js
git commit -m "feat(threads): validate tag lists and filter stray ids from scene markers"
```

---

### Task 2: Chapter tag endpoint

→ S1

**Files:**
- Modify: `server/src/routes/chapters.js`
- Test: `server/test/chapterThreadIds.test.js`

**Interfaces:**
- Consumes: `checkTagList`, `knownThreadIds` (`threadTags.js`), `knownThreadSet` (`threadScope.js`), `chapterResponse` (already in `chapters.js`).
- Produces: `PUT /api/works/:workId/chapters/:chapterId/threads` `{ threadIds }` → 200 chapter JSON; 400 `INVALID_FIELD`; 404 `NOT_FOUND`.

- [ ] **Step 1: Write the failing tests** (append to `server/test/chapterThreadIds.test.js`; add `import PlotThread from '../src/models/PlotThread.js';`)

```js
const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const newThread = (id, workId = 'work_a') => PlotThread.create({ _id: id, workId, name: id, color: '#c9a96e', status: 'open', order: 0 });

test('PUT …/threads sets and clears chapter tags without touching edit times', async () => {
  await newThread('thr_a');
  await newThread('thr_b');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One', lastEditedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const set = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: ['thr_a', 'thr_b', 'thr_a'] });
  assert.equal(set.status, 200);
  assert.deepEqual(set.body.threadIds, ['thr_a', 'thr_b']);
  const saved = await Chapter.findById('ch_1').lean();
  assert.deepEqual(saved.threadIds, ['thr_a', 'thr_b']);
  assert.equal(saved.lastEditedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(saved.updatedAt, '2026-01-01T00:00:00.000Z');
  const cleared = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: [] });
  assert.deepEqual(cleared.body.threadIds, []);
});

test('PUT …/threads drops ids that are not threads of this work', async () => {
  await newThread('thr_a');
  await newThread('thr_other', 'work_b');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One' });
  const res = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: ['thr_a', 'thr_gone', 'thr_other'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.threadIds, ['thr_a']);
});

test('PUT …/threads refuses a bad body and writes nothing', async () => {
  await newThread('thr_a');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One', threadIds: ['thr_a'] });
  for (const body of [{}, { threadIds: 'thr_a' }, { threadIds: [1] }, { threadIds: ['bad id'] }, { threadIds: Array.from({ length: 51 }, (_, i) => `thr_${i}`) }]) {
    const res = await call('put', '/api/works/work_a/chapters/ch_1/threads').send(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(res.body.code, 'INVALID_FIELD');
  }
  assert.deepEqual((await Chapter.findById('ch_1').lean()).threadIds, ['thr_a']);
});

test('PUT …/threads 404s for a missing chapter or another writer\'s work', async () => {
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One' });
  assert.equal((await call('put', '/api/works/work_a/chapters/nope/threads').send({ threadIds: [] })).status, 404);
  assert.equal((await call('put', '/api/works/work_a/chapters/ch_1/threads', 'user_b').send({ threadIds: [] })).status, 404);
});
```

Also add `{ _id: 'work_b', ownerId: 'user_a', title: 'B' }` to the `Work.create` in this file's `beforeEach` (make it `Work.create([...])`).

- [ ] **Step 2: Run to verify failure**

Run: `cd server && node --test test/chapterThreadIds.test.js` → FAIL (404/no route).

- [ ] **Step 3: Implement.** In `server/src/routes/chapters.js` add imports:

```js
import { checkTagList, knownThreadIds } from '../services/threadTags.js';
import { knownThreadSet } from '../services/threadScope.js';
```

and, after `chapterResponse` is defined (before the scenes/move route):

```js
// PUT /api/works/:workId/chapters/:chapterId/threads { threadIds }
// The autosave PUT ignores threadIds so a stale editor can't overwrite tags; this is their write path
router.put('/:chapterId/threads', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const checked = checkTagList(req.body?.threadIds);
    if (!checked.ok) return next(httpError(400, 'INVALID_FIELD', checked.message));
    const threadIds = knownThreadIds(checked.ids, await knownThreadSet(workId));
    const updated = await Chapter.findOneAndUpdate(
      { _id: chapterId, workId },
      { $set: { threadIds } },
      { new: true, timestamps: false }
    );
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    res.json(chapterResponse(updated));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && node --test test/chapterThreadIds.test.js` → PASS (including the original "PUT ignores threadIds" test).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chapters.js server/test/chapterThreadIds.test.js
git commit -m "feat(threads): add a validated write path for chapter thread tags"
```

---

### Task 3: Filter scene tags on save and scene move

→ S1, S3, S4

**Files:**
- Modify: `server/src/routes/chapters.js` (chapter PUT, `writeMovedChapter`, move route)
- Create: `server/test/threadSurvival.test.js`

**Interfaces:**
- Consumes: `filterHtmlThreads`, `knownThreadSet`.

- [ ] **Step 1: Write the failing tests.** Create `server/test/threadSurvival.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import PlotThread from '../src/models/PlotThread.js';
import { sceneSummaries } from '../src/services/sceneMarkers.js';

const app = buildApp();
let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'A' });
});

const call = (method, path) => request(app)[method](path).set('x-test-user', 'user_a');
const thread = (id) => PlotThread.create({ _id: id, workId: 'work_a', name: id, color: '#c9a96e', status: 'open', order: 0 });
const hr = (id, threads) => `<hr data-scene="${id}"${threads ? ` data-threads="${threads}"` : ''} data-status="draft" />`;
const chapter = (_id, contentHtml, threadIds = [], extra = {}) =>
  Chapter.create({ _id, workId: 'work_a', title: _id, contentHtml, content: 'text', threadIds, scenes: sceneSummaries(contentHtml), ...extra });

test('saving keeps scene tags that are threads and drops strays; reload shows them', async () => {
  await thread('thr_a');
  await chapter('ch_1', '');
  const html = `${hr('scn_1', 'thr_a thr_gone')}<div>One.</div>`;
  const res = await call('put', '/api/works/work_a/chapters/ch_1').send({ content: 'One.', contentHtml: html });
  assert.equal(res.status, 200);
  const reloaded = (await call('get', '/api/works/work_a/chapters/ch_1')).body;
  assert.match(reloaded.contentHtml, /data-threads="thr_a"/);
  assert.doesNotMatch(reloaded.contentHtml, /thr_gone/);
  assert.deepEqual(reloaded.scenes.map((s) => s.threadIds), [['thr_a']]);
});

test('a scene keeps its tags when it moves to another chapter and within a chapter', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a')}<div>One.</div>${hr('scn_2', 'thr_a thr_b')}<div>Two.</div>`);
  await chapter('ch_2', `${hr('scn_3', 'thr_b')}<div>Three.</div>`);

  const across = await call('post', '/api/works/work_a/chapters/ch_1/scenes/move').send({ sceneId: 'scn_2', toChapterId: 'ch_2', toIndex: 0 });
  assert.equal(across.status, 200);
  const dst = await Chapter.findById('ch_2').lean();
  assert.deepEqual(dst.scenes.map((s) => [s.id, s.threadIds]), [['scn_2', ['thr_a', 'thr_b']], ['scn_3', ['thr_b']]]);
  const src = await Chapter.findById('ch_1').lean();
  assert.deepEqual(src.scenes.map((s) => [s.id, s.threadIds]), [['scn_1', ['thr_a']]]);

  const within = await call('post', '/api/works/work_a/chapters/ch_2/scenes/move').send({ sceneId: 'scn_3', toChapterId: 'ch_2', toIndex: 0 });
  assert.equal(within.status, 200);
  assert.deepEqual((await Chapter.findById('ch_2').lean()).scenes.map((s) => [s.id, s.threadIds]), [['scn_3', ['thr_b']], ['scn_2', ['thr_a', 'thr_b']]]);
});

test('a move drops tags of a thread deleted since the scene was saved', async () => {
  await thread('thr_a');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_gone')}<div>One.</div>${hr('scn_2')}<div>Two.</div>`);
  await chapter('ch_2', '<div>Other.</div>');
  await call('post', '/api/works/work_a/chapters/ch_1/scenes/move').send({ sceneId: 'scn_1', toChapterId: 'ch_2', toIndex: 0 });
  const dst = await Chapter.findById('ch_2').lean();
  assert.doesNotMatch(dst.contentHtml, /thr_gone/);
  assert.deepEqual(dst.scenes[0].threadIds, ['thr_a']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && node --test test/threadSurvival.test.js`
Expected: test 1 FAILS (stray id kept); tests 2–3 pass or fail on the stray check, so test 3 FAILS.

- [ ] **Step 3: Implement.** In `server/src/routes/chapters.js` import `filterHtmlThreads` with the other `threadTags.js` imports (`import { checkTagList, knownThreadIds, filterHtmlThreads } from '../services/threadTags.js';`).

In the chapter PUT, replace the `newHtml` declaration with:

```js
    const newHtml =
      req.body.contentHtml !== undefined
        ? filterHtmlThreads(sanitizeChapterHtml(req.body.contentHtml), await knownThreadSet(workId))
        : chapter.contentHtml;
```

Change `writeMovedChapter` to take the set:

```js
async function writeMovedChapter(chapter, html, now, known) {
  const clean = filterHtmlThreads(sanitizeChapterHtml(html), known);
```

In the move route, after the `NO_CHANGE` check add `const known = await knownThreadSet(workId);` and pass `known` as the fourth argument to both `writeMovedChapter` calls.

- [ ] **Step 4: Run to verify pass**

Run: `cd server && node --test test/threadSurvival.test.js test/sceneMove.test.js test/htmlService.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chapters.js server/test/threadSurvival.test.js
git commit -m "feat(threads): drop stray scene tags on save and scene move"
```

---

### Task 4: Snapshots carry chapter tags; restore and bring-back

→ S3, S4

**Files:**
- Modify: `server/src/models/Snapshot.js`, `server/src/services/snapshotData.js`, `server/src/services/snapshotService.js`, `server/src/routes/milestones.js`, `server/test/support/http.js`, `server/test/snapshotData.test.js`
- Test: `server/test/threadSurvival.test.js`

**Interfaces:**
- Consumes: `filterHtmlThreads`, `knownThreadIds`, `knownThreadSet`.
- Produces: `Snapshot.threadIds` (absent on snapshots taken before this change); `snapshotFields(chapter)` now includes `threadIds`.

- [ ] **Step 1: Write the failing tests**

In `server/test/snapshotData.test.js`, update the first test to the new shape:

```js
test('snapshotFields copies the chapter text and tags', () => {
  const chapter = { _id: 'ch_1', workId: 'w_1', title: 'One', content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2, threadIds: ['thr_a'] };
  assert.deepEqual(snapshotFields(chapter), {
    workId: 'w_1', chapterId: 'ch_1', chapterTitle: 'One',
    content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2, threadIds: ['thr_a'],
  });
  assert.deepEqual(snapshotFields({ _id: 'c', workId: 'w', title: 'T' }), {
    workId: 'w', chapterId: 'c', chapterTitle: 'T', content: '', contentHtml: '', wordCount: 0, threadIds: [],
  });
});
```

In `server/test/support/http.js` add imports and mounts (snapshots before chapters):

```js
import snapshotsRouter from '../../src/routes/snapshots.js';
import milestonesRouter from '../../src/routes/milestones.js';
```
```js
  app.use('/api/works/:workId/chapters/:chapterId/snapshots', snapshotsRouter);
  app.use('/api/works/:workId/milestones', milestonesRouter);
```
(place the snapshots line immediately before the existing `chapters` mount).

Append to `server/test/threadSurvival.test.js` (add `import Snapshot from '../src/models/Snapshot.js';`):

```js
const snapshot = async (chapterId, name = 'Keep') =>
  (await call('post', `/api/works/work_a/chapters/${chapterId}/snapshots`).send({ name })).body.id;
const restore = (chapterId, snapId) => call('post', `/api/works/work_a/chapters/${chapterId}/snapshots/${snapId}/restore`);

test('restoring a snapshot brings back chapter and scene tags', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const snapId = await snapshot('ch_1');
  await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: [] });
  await call('put', '/api/works/work_a/chapters/ch_1').send({ content: 'Changed.', contentHtml: `${hr('scn_1')}<div>Changed.</div>` });

  const res = await restore('ch_1', snapId);
  assert.equal(res.status, 200);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_a', 'thr_b']);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_a']]);
  assert.match(ch.contentHtml, /data-threads="thr_a"/);
});

test('restoring never brings back a deleted thread', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_b')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const snapId = await snapshot('ch_1');
  await call('delete', '/api/works/work_a/threads/thr_a');
  await restore('ch_1', snapId);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_b']);
  assert.doesNotMatch(ch.contentHtml, /thr_a/);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_b']]);
});

test('restoring a snapshot from before chapter tags existed leaves the chapter tags alone', async () => {
  await thread('thr_a');
  await chapter('ch_1', '<div>Now.</div>', ['thr_a']);
  await Snapshot.collection.insertOne({
    _id: 'snap_old', workId: 'work_a', chapterId: 'ch_1', kind: 'auto', content: 'Old.', contentHtml: '<div>Old.</div>', wordCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
  });
  const res = await restore('ch_1', 'snap_old');
  assert.equal(res.status, 200);
  const ch = await Chapter.findById('ch_1').lean();
  assert.equal(ch.content, 'Old.');
  assert.deepEqual(ch.threadIds, ['thr_a']);
});

test('bringing a deleted chapter back from a milestone restores its tags, minus deleted threads', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_b')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const ms = (await call('post', '/api/works/work_a/milestones').send({ name: 'First draft' })).body.id;
  await call('delete', '/api/works/work_a/chapters/ch_1');
  await call('delete', '/api/works/work_a/threads/thr_b');

  const res = await call('post', `/api/works/work_a/milestones/${ms}/chapters/ch_1/restore`);
  assert.equal(res.status, 201);
  assert.equal(res.body.recreated, true);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_a']);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_a']]);
});

test('a chapter recreated from a milestone without chapter tags comes back untagged', async () => {
  await thread('thr_a');
  await Snapshot.collection.insertOne({
    _id: 'snap_old', workId: 'work_a', chapterId: 'ch_9', kind: 'milestone', milestoneId: 'ms_old', content: 'Old.', contentHtml: '<div>Old.</div>', wordCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
  });
  await (await import('../src/models/Milestone.js')).default.create({
    _id: 'ms_old', workId: 'work_a', name: 'Old', createdAt: '2026-01-01T00:00:00.000Z',
    chapters: [{ chapterId: 'ch_9', title: 'Nine', order: 0, snapshotId: 'snap_old', wordCount: 1 }],
  });
  const res = await call('post', '/api/works/work_a/milestones/ms_old/chapters/ch_9/restore');
  assert.equal(res.status, 201);
  assert.deepEqual((await Chapter.findById('ch_9').lean()).threadIds, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && node --test test/snapshotData.test.js test/threadSurvival.test.js`
Expected: FAIL (`snapshotFields` lacks `threadIds`; restore doesn't touch tags; stray ids revive).

- [ ] **Step 3: Implement**

`server/src/models/Snapshot.js`, add to the schema after `contentHtml`:

```js
    threadIds: { type: [String], default: undefined }, // chapter tags; absent on snapshots from before tagging
```

`server/src/services/snapshotData.js`, in `snapshotFields` add `threadIds: [...(chapter.threadIds || [])],` after `wordCount`.

`server/src/services/snapshotService.js`: add imports

```js
import { filterHtmlThreads, knownThreadIds } from './threadTags.js';
import { knownThreadSet } from './threadScope.js';
```

and replace the body of `restoreFromSnapshot` after the `takeAutoSnapshot` call with:

```js
  const known = await knownThreadSet(chapter.workId);
  const content = snapshot.content || '';
  const contentHtml = filterHtmlThreads(snapshot.contentHtml || '', known);
  const set = { content, contentHtml, scenes: sceneSummaries(contentHtml), wordCount: countWords(content), updatedAt: now };
  // Snapshots from before tagging have no chapter tags; the live ones stay
  if (Array.isArray(snapshot.threadIds)) set.threadIds = knownThreadIds(snapshot.threadIds, known);
  const updated = await Chapter.findOneAndUpdate({ _id: chapter._id, workId: chapter.workId }, { $set: set }, { new: true });
  await recalculate(chapter.workId);
  return updated;
```

`server/src/routes/milestones.js`: import `filterHtmlThreads, knownThreadIds` from `../services/threadTags.js` and `knownThreadSet` from `../services/threadScope.js`. In the recreate branch, before `Chapter.create`:

```js
    const known = await knownThreadSet(workId);
    const contentHtml = filterHtmlThreads(snapshot.contentHtml || '', known);
```

and in the `Chapter.create` object use `contentHtml,`, `scenes: sceneSummaries(contentHtml),` and add `threadIds: Array.isArray(snapshot.threadIds) ? knownThreadIds(snapshot.threadIds, known) : [],`.

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npm test` → full server suite PASS (watch `snapshot*.test.js`, `milestoneCompare.test.js`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/test
git commit -m "feat(threads): keep chapter tags in snapshots and filter strays on restore"
```

---

### Task 5: Client tag helpers

→ S2

**Files:**
- Modify: `client/src/utils/threads.js`, `client/src/utils/scenes.js`
- Test: `client/test/sceneThreads.test.js`

**Interfaces:**
- Produces: `tagList(value) → string[]` (array in, valid deduped ids out; anything else → `[]`); `toggleTag(ids, id) → string[]`; `setChapterThreads(api, workId, chapterId, threadIds) → Promise<chapter>`.

- [ ] **Step 1: Write the failing tests** (append to `client/test/sceneThreads.test.js`; add `tagList, toggleTag, setChapterThreads` to the `../src/utils/threads.js` import)

```js
test('tagList accepts arrays only and keeps valid ids', () => {
  assert.deepEqual(tagList(['thr_1', 'bad id', 'thr_1', 'thr_2']), ['thr_1', 'thr_2']);
  for (const bad of [undefined, null, 'thr_1', { 0: 'thr_1' }, 7]) assert.deepEqual(tagList(bad), []);
});

test('toggleTag adds a missing id and removes a present one', () => {
  assert.deepEqual(toggleTag(['thr_1'], 'thr_2'), ['thr_1', 'thr_2']);
  assert.deepEqual(toggleTag(['thr_1', 'thr_2'], 'thr_1'), ['thr_2']);
  assert.deepEqual(toggleTag(undefined, 'thr_1'), ['thr_1']);
});

test('markerHtml and applyCard survive a threadIds that is not an array', () => {
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: 'thr_1' }), /data-threads/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: { length: 1 } }), /data-threads/);
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  assert.doesNotThrow(() => applyCard(marker, { status: 'draft', threadIds: 'thr_2' }));
  assert.equal(marker.hasAttribute('data-threads'), false);
});

test('setChapterThreads puts the tag list on the chapter', async () => {
  const calls = [];
  const api = { put: async (path, body) => (calls.push([path, body]), { id: 'c1' }) };
  await setChapterThreads(api, 'w1', 'c1', ['thr_1']);
  assert.deepEqual(calls, [['/works/w1/chapters/c1/threads', { threadIds: ['thr_1'] }]]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && node --import ./test/support/register.js --test test/sceneThreads.test.js`
Expected: FAIL (`tagList` etc. not exported; `.join` on a string throws).

- [ ] **Step 3: Implement.** Append to `client/src/utils/threads.js`:

```js
// Only arrays carry tags; anything else is no tags
export function tagList(value) {
  return Array.isArray(value) ? parseThreadIds(value.join(' ')) : [];
}

export function toggleTag(ids, id) {
  const list = tagList(ids);
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function setChapterThreads(api, workId, chapterId, threadIds) {
  return api.put(`/works/${workId}/chapters/${chapterId}/threads`, { threadIds });
}
```

In `client/src/utils/scenes.js` change the import to `import { parseThreadIds, tagList } from './threads.js';`, then in `markerHtml` replace the `threads` line with `const threads = tagList(fields.threadIds);` and in `applyCard` replace it with `const threads = tagList(fields.threadIds);`. Remove `parseThreadIds` from the import if it's no longer used elsewhere in `scenes.js` (it is still used by `cardOf`: keep it).

- [ ] **Step 4: Run to verify pass**

Run: `cd client && node --import ./test/support/register.js --test test/sceneThreads.test.js test/scenes.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils client/test/sceneThreads.test.js
git commit -m "feat(threads): add client tag helpers and make marker joins array-safe"
```

---

### Task 6: Tag UI and markers in the Scenes tab

→ S2

**Files:**
- Create: `client/src/components/panel/ThreadChips.jsx`
- Modify: `client/src/components/panel/SceneRow.jsx`, `client/src/components/panel/ScenesTab.jsx`, `client/src/index.css`
- Test: `client/test/threadChips.test.js`

**Interfaces:**
- Consumes: `toggleTag`, `tagList`, `setChapterThreads` (Task 5); `useActiveWork().state.threads` (`{ id, name, color, status }`), `refreshThreads`, `refreshChapters`.
- Produces: `ThreadChips({ threads, selected, onToggle, disabled, label })`; `ThreadMarkers({ threads, ids })`; `ChapterThreads({ threads, selected, onToggle, busy, error })`; `SceneRow` takes a `threads` prop and passes `threadIds` in the draft it hands to `onSave`.

- [ ] **Step 1: Write the failing tests.** Create `client/test/threadChips.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import { ThreadChips, ThreadMarkers, ChapterThreads } from '../src/components/panel/ThreadChips.jsx';
import SceneRow from '../src/components/panel/SceneRow.jsx';

const threads = [
  { id: 'thr_1', name: 'The missing heir', color: '#c9a96e', status: 'open' },
  { id: 'thr_2', name: 'Storm', color: '#7fa7d9', status: 'resolved' },
];

test('chips show every thread, mark the selected ones and toggle on click', async () => {
  const toggled = [];
  const view = await renderApp(h(ThreadChips, { threads, selected: ['thr_1'], onToggle: (id) => toggled.push(id), label: 'Threads' }));
  const chips = view.queryAll('.thread-chip');
  assert.equal(chips.length, 2);
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  assert.equal(chips[1].getAttribute('aria-pressed'), 'false');
  await click(chips[1]);
  assert.deepEqual(toggled, ['thr_2']);
  await view.unmount();
});

test('markers are coloured per thread, named in the tooltip, and skip unknown ids', async () => {
  const view = await renderApp(h(ThreadMarkers, { threads, ids: ['thr_2', 'thr_gone', 'thr_1'] }));
  const marks = view.queryAll('.thread-marker');
  assert.deepEqual(marks.map((m) => m.getAttribute('title')), ['Storm', 'The missing heir']);
  assert.match(marks[0].getAttribute('style'), /#7fa7d9/);
  await view.unmount();
});

test('the chapter strip hints at the Map when the work has no threads', async () => {
  const view = await renderApp(h(ChapterThreads, { threads: [], selected: [], onToggle() {}, busy: false, error: '' }));
  assert.match(view.text(), /Define plot threads on the Map/);
  assert.equal(view.queryAll('.thread-chip').length, 0);
  await view.unmount();
});

test('the chapter strip shows a save error and disables chips while busy', async () => {
  const view = await renderApp(h(ChapterThreads, { threads, selected: [], onToggle() {}, busy: true, error: 'Could not save' }));
  assert.match(view.text(), /Could not save/);
  assert.ok(view.queryAll('.thread-chip').every((c) => c.disabled));
  await view.unmount();
});

const scene = { id: 'scn_a', index: 0, title: 'Arrival', pov: '', location: '', status: 'draft', summary: '', wordCount: 10, threadIds: ['thr_1'], marker: null };

function mountRow(onSave) {
  return renderApp(h('ul', null, h(SceneRow, { scene, threads, current: false, characters: [], places: [], onJump() {}, onSave, onRemove() {}, busy: false })));
}

test('a scene row shows its thread markers', async () => {
  const view = await mountRow(() => {});
  assert.deepEqual(view.queryAll('.thread-marker').map((m) => m.getAttribute('title')), ['The missing heir']);
  await view.unmount();
});

test('the scene card sets and clears tags and saves them with the card', async () => {
  const saved = [];
  const view = await mountRow((fields) => saved.push(fields));
  await click(view.button('Edit card'));
  const chips = view.queryAll('.scene-card-form .thread-chip');
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  await click(chips[0]); // clear thr_1
  await click(chips[1]); // set thr_2
  await click(view.button('Save'));
  assert.deepEqual(saved[0].threadIds, ['thr_2']);
  await view.unmount();
});
```

(`view.query`, `view.queryAll`, `view.button` and `view.text` come from `renderApp` in `client/test/support/app.js`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd client && node --import ./test/support/register.js --test test/threadChips.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement.** Create `client/src/components/panel/ThreadChips.jsx`:

```jsx
import { tagList } from '../../utils/threads.js';

// One toggle chip per plot thread of the work
export function ThreadChips({ threads, selected, onToggle, disabled, label }) {
  const on = tagList(selected);
  return (
    <div className="thread-chips" role="group" aria-label={label}>
      {threads.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`thread-chip${on.includes(t.id) ? ' on' : ''}${t.status === 'resolved' ? ' resolved' : ''}`}
          style={{ '--thread-color': t.color }}
          aria-pressed={on.includes(t.id)}
          disabled={disabled}
          onClick={() => onToggle(t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

// Small coloured dots for the tags a scene carries; ids that aren't threads are skipped
export function ThreadMarkers({ threads, ids }) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const marks = tagList(ids).map((id) => byId.get(id)).filter(Boolean);
  if (!marks.length) return null;
  return (
    <span className="thread-markers">
      {marks.map((t) => (
        <span key={t.id} className="thread-marker" title={t.name} aria-label={t.name} style={{ background: t.color }} />
      ))}
    </span>
  );
}

// The open chapter's own tags, at the top of the Scenes tab
export function ChapterThreads({ threads, selected, onToggle, busy, error }) {
  return (
    <section className="chapter-threads">
      <h3 className="chapter-threads-title">Chapter threads</h3>
      {threads.length === 0 ? (
        <p className="scenes-hint">No plot threads yet. Define plot threads on the Map.</p>
      ) : (
        <ThreadChips threads={threads} selected={selected} onToggle={onToggle} disabled={busy} label="Chapter threads" />
      )}
      {error && <p className="scene-row-error">{error}</p>}
    </section>
  );
}
```

`SceneRow.jsx`: import `{ ThreadChips, ThreadMarkers }` from `./ThreadChips.jsx` and `{ toggleTag, tagList }` from `../../utils/threads.js`; add `threads = []` to the props; in `startEdit` add `threadIds: tagList(scene.threadIds)` to the draft; show markers inside the `scene-row-line` span after the status span: `<ThreadMarkers threads={threads} ids={scene.threadIds} />`; in the edit form after the Status label add:

```jsx
          {threads.length > 0 && (
            <div className="scene-card-threads">
              <span className="scene-card-threads-label">Threads</span>
              <ThreadChips threads={threads} selected={draft.threadIds} onToggle={(id) => setDraft({ ...draft, threadIds: toggleTag(draft.threadIds, id) })} label="Scene threads" />
            </div>
          )}
```

`ScenesTab.jsx`: import `{ ChapterThreads }` from `./ThreadChips.jsx`, `{ setChapterThreads, toggleTag, tagList }` from `../../utils/threads.js`; destructure `refreshThreads` from `useActiveWork()`; add state `const [tagging, setTagging] = useState(false); const [tagError, setTagError] = useState('');`; add effects/handlers:

```jsx
  // Chip names and colours come from the work's threads, loaded on demand
  useEffect(() => {
    if (workId) refreshThreads(workId);
  }, [workId, refreshThreads]);

  const threads = workState.threads || [];
  const chapter = (workState.chapters || []).find((c) => c.id === editorState.chapterId);
  const chapterTags = tagList(chapter?.threadIds);

  async function toggleChapterThread(threadId) {
    setTagging(true);
    setTagError('');
    try {
      await setChapterThreads(api, workId, editorState.chapterId, toggleTag(chapterTags, threadId));
      await refreshChapters(workId);
    } catch (err) {
      setTagError(err.message || 'The tag could not be saved.');
    } finally {
      setTagging(false);
    }
  }
  const chapterThreads = (
    <ChapterThreads threads={threads} selected={chapterTags} onToggle={toggleChapterThread} busy={tagging} error={tagError} />
  );
```

(place the new `useEffect` with the other effects, above the early returns). Render `{chapterThreads}` as the first child of both returned `<div className="scenes-tab">` blocks (the no-markers branch too, so a chapter with no scene breaks can still be tagged), and pass `threads={threads}` to each `<SceneRow>`.

`client/src/index.css`, append near the scene styles:

```css
.chapter-threads { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.chapter-threads-title { margin: 0; font-family: Georgia, serif; color: var(--gold); font-size: 0.9rem; font-weight: normal; }
.thread-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.thread-chip { border: 1px solid var(--thread-color, var(--border)); border-radius: 999px; background: transparent; color: var(--text-muted); font-size: 0.78rem; padding: 2px 10px; cursor: pointer; }
.thread-chip.on { background: var(--thread-color, var(--gold)); color: #0e0e16; }
.thread-chip.resolved:not(.on) { opacity: 0.55; text-decoration: line-through; }
.thread-chip:disabled { cursor: default; opacity: 0.6; }
.thread-markers { display: inline-flex; gap: 4px; align-items: center; }
.thread-marker { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.scene-card-threads { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--text-muted); }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd client && npm test` → full client suite PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src client/test
git commit -m "feat(threads): tag chapters and scenes with thread chips and show markers"
```

---

### Task 7: Refresh chapters after a thread delete

→ S2

**Files:**
- Modify: `client/src/components/map/ThreadManager.jsx`, `client/src/pages/MapView.jsx`
- Test: `client/test/threadManager.test.js`

**Interfaces:**
- Produces: `ThreadManager` prop `onDeleted?: () => Promise<void> | void`, called after a successful delete and the list reload.

- [ ] **Step 1: Write the failing test.** In `client/test/threadManager.test.js`, change `mount` to count deletions: add `let deleted = 0;`, pass `onDeleted: async () => { deleted += 1; }` in the props, and return `deleted: () => deleted` alongside `changed`. Then append:

```js
test('tells the page after a delete so chapter tags can be reloaded', async () => {
  const view = await mount();
  await click(view.button('Delete'));
  await click(view.button('Delete thread'));
  assert.equal(view.deleted(), 1);
  await view.unmount();
});

test('does not call onDeleted for other writes', async () => {
  const view = await mount();
  await click(view.query('.thread-status'));
  assert.equal(view.deleted(), 0);
  await view.unmount();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && node --import ./test/support/register.js --test test/threadManager.test.js` → first new test FAILS (`deleted()` is 0).

- [ ] **Step 3: Implement.** `ThreadManager.jsx`: add `onDeleted` to the props and replace the `onDelete` handler with:

```jsx
            onDelete={async () => {
              if (await run(thread.id, () => api.delete(`${base}/${thread.id}`))) await onDeleted?.();
            }}
```

`MapView.jsx`: add `refreshChapters` to the `useActiveWork()` destructure and pass `onDeleted={() => refreshChapters(workId)}` to `<ThreadManager>`.

- [ ] **Step 4: Run to verify pass**

Run: `cd client && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src client/test
git commit -m "fix(threads): reload chapters after a thread is deleted"
```

---

### Task 8: Verify and walk the app

→ S4

**Files:** none (verification only).

- [ ] **Step 1:** Run both full suites in WSL: `cd server && npm test` and `cd client && npm test`. Expected: all pass. Read the real output; fix any failure before moving on.
- [ ] **Step 2: Local app walk** (per the vault note: run the cached `~/.cache/mongodb-binaries/mongod-*` on a spare port; server with `DEV_AUTH_BYPASS=true` and `MONGODB_URI` pointed at it; Vite with a temporary config proxying `/api` to `127.0.0.1:3001`). In the browser: create two threads on the Map; in the Main Room Scenes tab tag the chapter and a scene, reload, confirm chips and markers persist; move the scene to another chapter and confirm the marker stays; take a named snapshot, change tags, restore, confirm tags return; delete a thread on the Map and confirm its chip and marker disappear after returning to the Main Room.
- [ ] **Step 3:** Record in the notes any gotchas found. No commit needed unless the walk found a defect (fix it test-first in the owning task's files).

---

## Criteria coverage

| Criterion | Proven by |
|---|---|
| A1 sets/clears on scenes and chapters | Task 2 endpoint tests (set, clear, invalid); Task 6 `threadChips.test.js` (scene card save, chapter strip toggle); Task 8 walk |
| A2 survives save, reload, moves, restore, bring-back | Task 3 (`saving keeps scene tags…`, scene move tests); Task 4 (restore, deleted thread, old snapshot, milestone bring-back); Task 8 walk |
| A3 coloured markers in Scenes tab | Task 6 `markers are coloured per thread…`, `a scene row shows its thread markers`; Task 8 walk |
| A4 tests cover tagging and survival | Tasks 1–7 test files; Task 8 full-suite run |

## Subtask coverage

S1 Tag storage → Tasks 1, 2, 3. S2 Tag UI on scenes and chapters → Tasks 5, 6, 7. S3 Survive scene moves and restore → Tasks 3, 4. S4 Tests → Tasks 3, 4, 8 (and the tests inside every task). Nothing is proposed for descope.
