# Plot Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writers can create, rename, recolour, describe, resolve and delete plot threads per work on the Map. Thread tags (on scenes and chapters) have a fixed storage format, and deleting a thread strips its tags.

**Architecture:** A new `PlotThread` collection and a `/api/works/:workId/threads` router behind `loadWork`. Scene tags are a `data-threads` attribute on the existing `<hr data-scene>` markers (kept by the sanitiser and parsed by `sceneMarkers`). Chapter tags are `Chapter.threadIds`. Deleting a thread runs `removeThreadFromWork`, which strips the id from every chapter of the work. On the Map, a `ThreadManager` section manages threads through `ActiveWorkContext`.

**Tech Stack:** Express 4 + Mongoose (ESM), `node --test`, `mongodb-memory-server-core` + `supertest` (new server dev deps), React 18 + linkedom component tests.

**Spec:** `docs/superpowers/specs/2026-10-12-plot-threads-design.md`

**Card:** https://trello.com/c/Lj8zufyf. Subtasks: S1 Decide Q-1 (scenes only, or chapters too) · S2 Data model and API · S3 Thread manager UI · S4 Delete cleanup · S5 Tests

## Global Constraints

- Thread id: `thr_<ms>_<6 hex>`. Tag ids accepted in HTML match `^thr_[A-Za-z0-9_]{1,60}$`, at most 50 per marker.
- `name` 1–80 chars after trim, unique per work, case-insensitive. `description` 0–1000 chars after trim. `status` is `open` | `resolved`. `color` is `#rrggbb`, stored lowercase.
- Palette in order: `#c9a96e`, `#7fa7d9`, `#d97f7f`, `#8fc98f`, `#b58fd9`, `#d9a35f`, `#6fc2c2`, `#d98fb8`. The default is `palette[count % 8]`.
- Error codes: `400 MISSING_FIELD` (no name on create), `400 INVALID_FIELD` (bad or unknown field, bad reorder), `409 DUPLICATE_NAME`, `404 NOT_FOUND`.
- Snapshots are never changed by thread deletion.
- Use `mongodb-memory-server-core` (not `mongodb-memory-server`). The full package downloads mongod on `npm install`, and that would bloat the dev Docker image. The core package downloads on first test run into `~/.cache/mongodb-binaries`.
- Server and client are ESM. Server tests: `npm --prefix server test`. Client tests: `npm --prefix client test`. Run from the worktree root.
- Commits: Conventional Commits, ≤72-char subject. Body ends with `Trello: https://trello.com/c/Lj8zufyf`, then the attribution lines.

## Review Focus

1. **Editing a scene card must keep its tags.** The Scenes tab's card form saves `{title,pov,location,status,summary}` with no `threadIds`, so `applyCard` must leave `data-threads` alone when `threadIds` isn't passed. Test in Task 5.
2. **Duplicate names that differ only in case or surrounding spaces** (`" mara's DEBT "` vs `"Mara's debt"`) → 409. Renaming a thread to a new casing of its own name → 200. Tests in Task 3.
3. **Names with regex characters** (`Who (really) did it?`, `Who .* did it?`) must not collide with each other. Duplicate checks use a collation, not a regex. Test in Task 3.
4. **A tag id that merely starts with the deleted id** (`thr_1_abc` vs `thr_1_abcdef`) must survive deletion. Stripping works on whole tokens. Tests in Task 1 (unit) and Task 4 (database).
5. **Hostile or junk `data-threads` values in pasted HTML** (quotes, `javascript:`, hundreds of ids, the attribute on a `<p>`) are cleaned by the sanitiser. Tests in Task 1.

---

## File map

| File | Responsibility |
|---|---|
| `server/src/services/threadTags.js` (new) | Tag format: `parseThreadIds`, `knownThreadIds`, `stripThreadFromHtml` |
| `server/src/services/htmlService.js` | Keep and clean `data-threads` on scene markers |
| `server/src/services/sceneMarkers.js` | `threadIds` on scene cards and summaries |
| `server/src/models/Chapter.js` | `threadIds: [String]` |
| `server/src/models/PlotThread.js` (new) | Thread schema |
| `server/src/services/threadFields.js` (new) | Field whitelist and validation, id, default colour |
| `server/src/routes/threads.js` (new) | CRUD + reorder |
| `server/src/services/threadCleanup.js` (new) | `removeThreadFromWork` |
| `server/src/services/workService.js` | Cascade deletes threads |
| `server/src/server.js` | Mount the router |
| `server/test/support/http.js` (new) | In-memory Mongo + app for HTTP tests |
| `.github/workflows/test.yml` | Cache mongod binaries |
| `client/src/utils/threads.js` (new) | Palette, limits, client checks, tag count, delete message, `parseThreadIds` |
| `client/src/utils/scenes.js` | `data-threads` round trip |
| `client/src/context/ActiveWorkContext.jsx` | `threads` + `refreshThreads` |
| `client/src/components/map/ThreadManager.jsx`, `ThreadRow.jsx` (new) | UI |
| `client/src/pages/MapView.jsx` | Mount ThreadManager |
| `client/src/index.css` | Thread styles |
| `client/test/support/render.js` | `press` and `blur` helpers |

---

### Task 1: Tag format on the server (→ S1, S4)

Records Q-1 (scenes **and** chapters) as the storage format and adds the pure helpers that the delete cleanup uses.

**Files:**
- Create: `server/src/services/threadTags.js`
- Modify: `server/src/services/htmlService.js:9-43`, `server/src/services/sceneMarkers.js:86-125`, `server/src/models/Chapter.js`
- Test: `server/test/threadTags.test.js` (new), `server/test/sceneMarkers.test.js:78` (update expectation)

**Interfaces:**
- Produces: `parseThreadIds(value: unknown): string[]`, `knownThreadIds(ids: string[], known: Set<string>): string[]`, `stripThreadFromHtml(html: string, threadId: string): string`, `THREAD_ID: RegExp`, `MAX_TAGS = 50`. Scene cards from `parseScenes`/`sceneSummaries` gain `threadIds: string[]`. `Chapter.threadIds: string[]` (default `[]`).

- [ ] **Step 1: Write the failing tests** in `server/test/threadTags.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThreadIds, knownThreadIds, stripThreadFromHtml, MAX_TAGS } from '../src/services/threadTags.js';
import { sanitizeChapterHtml } from '../src/services/htmlService.js';
import { parseScenes, sceneSummaries } from '../src/services/sceneMarkers.js';

test('parseThreadIds keeps well-formed ids once, in order', () => {
  assert.deepEqual(parseThreadIds(' thr_1_aa  thr_2_bb thr_1_aa '), ['thr_1_aa', 'thr_2_bb']);
});

test('parseThreadIds drops anything that is not a thread id', () => {
  assert.deepEqual(parseThreadIds('thr_1 javascript:alert(1) "><x scn_1 thr_ thr_2-x'), ['thr_1']);
  assert.deepEqual(parseThreadIds(undefined), []);
  assert.deepEqual(parseThreadIds(['thr_1']), []);
});

test('parseThreadIds keeps at most MAX_TAGS ids', () => {
  const many = Array.from({ length: 80 }, (_, i) => `thr_${i}`).join(' ');
  assert.equal(parseThreadIds(many).length, MAX_TAGS);
});

test('knownThreadIds keeps only current threads', () => {
  assert.deepEqual(knownThreadIds(['thr_a', 'thr_gone', 'thr_b'], new Set(['thr_a', 'thr_b'])), ['thr_a', 'thr_b']);
  assert.deepEqual(knownThreadIds(undefined, new Set()), []);
});

test('stripThreadFromHtml removes the id from every marker and drops an emptied attribute', () => {
  const html =
    '<hr data-scene="scn_1" data-threads="thr_a thr_b" data-status="draft" /><div>One.</div>' +
    '<hr data-scene="scn_2" data-threads="thr_a" data-status="draft" /><div>Two.</div>';
  assert.equal(
    stripThreadFromHtml(html, 'thr_a'),
    '<hr data-scene="scn_1" data-threads="thr_b" data-status="draft" /><div>One.</div>' +
      '<hr data-scene="scn_2" data-status="draft" /><div>Two.</div>'
  );
});

test('stripThreadFromHtml only removes the exact id', () => {
  const html = '<hr data-scene="scn_1" data-threads="thr_1_abc thr_1_abcdef" data-status="draft" />';
  assert.equal(
    stripThreadFromHtml(html, 'thr_1_abc'),
    '<hr data-scene="scn_1" data-threads="thr_1_abcdef" data-status="draft" />'
  );
});

test('stripThreadFromHtml leaves html without the id unchanged', () => {
  const html = '<div data-threads="thr_a">text thr_a</div><hr data-scene="scn_1" data-status="draft" />';
  assert.equal(stripThreadFromHtml(html, 'thr_a'), html);
});

test('the sanitiser keeps data-threads on scene markers, cleaned', () => {
  const out = sanitizeChapterHtml('<hr data-scene="scn_a" data-threads="thr_1_aa bogus&quot;x thr_1_aa thr_2_bb"><div>A.</div>');
  assert.match(out, /<hr data-scene="scn_a" data-threads="thr_1_aa thr_2_bb" data-status="draft" \/>/);
});

test('the sanitiser drops data-threads when no id survives, and on other tags', () => {
  assert.doesNotMatch(sanitizeChapterHtml('<hr data-scene="scn_a" data-threads="nope javascript:x">'), /data-threads/);
  assert.doesNotMatch(sanitizeChapterHtml('<p data-threads="thr_1_aa">x</p>'), /data-threads/);
});

test('scenes expose their thread ids', () => {
  const html =
    '<hr data-scene="scn_a" data-threads="thr_1 thr_2" data-status="draft" /><div>A.</div>' +
    '<hr data-scene="scn_b" data-status="draft" /><div>B.</div>';
  assert.deepEqual(parseScenes(html).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
  assert.deepEqual(sceneSummaries(html).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix server test 2>&1 | grep -E "^✖|threadTags|Cannot find"`
Expected: fails with `Cannot find module '.../threadTags.js'`.

- [ ] **Step 3: Create `server/src/services/threadTags.js`**

```js
// Plot-thread tags. A scene's tags are a data-threads attribute (space-separated
// thread ids) on its <hr data-scene> marker; a chapter's are Chapter.threadIds.
// Ids that are not current threads of the work are strays and are ignored.
export const THREAD_ID = /^thr_[A-Za-z0-9_]{1,60}$/;
export const MAX_TAGS = 50;

export function parseThreadIds(value) {
  if (typeof value !== 'string') return [];
  const ids = [];
  for (const id of value.split(/\s+/)) {
    if (ids.length >= MAX_TAGS) break;
    if (THREAD_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function knownThreadIds(ids, known) {
  return (ids || []).filter((id) => known.has(id));
}

// Only touches the data-threads attribute of <hr> tags, so the rest of the
// stored HTML stays byte-for-byte the same
const MARKER_THREADS = /(<hr\b[^>]*?)\s+data-threads="([^"]*)"/g;

export function stripThreadFromHtml(html, threadId) {
  return html.replace(MARKER_THREADS, (match, before, list) => {
    const kept = list.split(/\s+/).filter((id) => id && id !== threadId);
    return kept.length ? `${before} data-threads="${kept.join(' ')}"` : before;
  });
}
```

- [ ] **Step 4: Keep `data-threads` in `htmlService.js`**

Add the import, then add `'data-threads'` to the `hr` allowed attributes, and in `sceneMarker()` write the cleaned list just before `data-status`:

```js
import { parseThreadIds } from './threadTags.js';
```

```js
    hr: ['data-scene', ...Object.values(SCENE_ATTRS), 'data-threads', 'data-status'],
```

```js
    const threads = parseThreadIds(attribs['data-threads']);
    if (threads.length) out['data-threads'] = threads.join(' ');
    out['data-status'] = SCENE_STATUSES.includes(attribs['data-status']) ? attribs['data-status'] : 'draft';
```

- [ ] **Step 5: Expose `threadIds` in `sceneMarkers.js`**

```js
import { parseThreadIds } from './threadTags.js';
```

In `cardOf`:

```js
export function cardOf(marker) {
  if (!marker) return { id: null, title: '', pov: '', location: '', status: 'draft', summary: '', threadIds: [] };
  const a = marker.attribs;
  const card = { id: a['data-scene'] };
  for (const [field, attr] of Object.entries(SCENE_ATTRS)) card[field] = a[attr] || '';
  card.status = SCENE_STATUSES.includes(a['data-status']) ? a['data-status'] : 'draft';
  card.threadIds = parseThreadIds(a['data-threads']);
  return card;
}
```

In `sceneSummaries`, add `threadIds` to the destructure and the returned object:

```js
  return scenes.map(({ id, title, pov, location, status, summary, wordCount, threadIds }) => ({
    id,
    title,
    pov,
    location,
    status,
    summary,
    wordCount,
    threadIds,
  }));
```

- [ ] **Step 6: Add `Chapter.threadIds`** in `server/src/models/Chapter.js`, after `scenes`:

```js
    // Plot threads tagged on the chapter as a whole (scene tags live on the markers)
    threadIds: { type: [String], default: [] },
```

- [ ] **Step 7: Run the whole server suite**

Run: `npm --prefix server test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: the new tests pass. `sceneMarkers.test.js` line ~78 (`sceneSummaries(html)` deepEqual) now fails because each summary has `threadIds`. Add `threadIds: []` to every expected object there, and to any other card or summary deepEqual the run reports (`sceneMove.test.js`, `snapshotData.test.js`, `milestoneCompare.test.js`). Re-run until `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/threadTags.js server/src/services/htmlService.js server/src/services/sceneMarkers.js server/src/models/Chapter.js server/test/
git commit -m "feat(threads): store thread tags on scene markers and chapters"
```

---

### Task 2: Thread fields and model (→ S2)

**Files:**
- Create: `server/src/services/threadFields.js`, `server/src/models/PlotThread.js`
- Test: `server/test/threadFields.test.js` (new)

**Interfaces:**
- Produces:
  - `threadCreate(body) → { ok: true, value: {name, color?, description?, status?} } | { ok: false, field, code, message }`
  - `threadUpdate(body) → { ok: true, set: {...} } | { ok: false, field, code, message }`
  - `newThreadId(now?) → string`
  - `defaultThreadColor(count: number) → string`
  - `THREAD_LIMITS = { name: 80, description: 1000 }`, `THREAD_STATUSES`, `THREAD_PALETTE`
  - Default export of `models/PlotThread.js`: the `PlotThread` model

- [ ] **Step 1: Write the failing tests** in `server/test/threadFields.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  threadCreate,
  threadUpdate,
  newThreadId,
  defaultThreadColor,
  THREAD_PALETTE,
} from '../src/services/threadFields.js';

test('newThreadId shape', () => {
  assert.match(newThreadId(1700000000000), /^thr_1700000000000_[0-9a-f]{6}$/);
});

test('default colours cycle through the palette', () => {
  assert.equal(THREAD_PALETTE.length, 8);
  assert.equal(defaultThreadColor(0), '#c9a96e');
  assert.equal(defaultThreadColor(1), '#7fa7d9');
  assert.equal(defaultThreadColor(8), '#c9a96e');
});

test('create needs a name', () => {
  for (const body of [{}, { name: '' }, { name: '   ' }, null]) {
    const r = threadCreate(body);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_FIELD');
  }
});

test('create trims and returns only given fields', () => {
  assert.deepEqual(threadCreate({ name: '  The heir  ' }), { ok: true, value: { name: 'The heir' } });
  assert.deepEqual(threadCreate({ name: 'A', color: '#AABBCC', description: ' d ', status: 'resolved' }), {
    ok: true,
    value: { name: 'A', color: '#aabbcc', description: 'd', status: 'resolved' },
  });
});

test('bad values are refused with the field named', () => {
  const cases = [
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ name: 42 }, 'name'],
    [{ color: 'red' }, 'color'],
    [{ color: '#abc' }, 'color'],
    [{ description: 'x'.repeat(1001) }, 'description'],
    [{ description: 5 }, 'description'],
    [{ status: 'closed' }, 'status'],
    [{ order: 2 }, 'order'],
    [{ workId: 'work_b' }, 'workId'],
  ];
  for (const [body, field] of cases) {
    const r = threadUpdate(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.field, field);
    assert.equal(r.code, 'INVALID_FIELD');
  }
});

test('an 80-character name and a 1000-character description are allowed', () => {
  assert.equal(threadUpdate({ name: 'x'.repeat(80), description: 'y'.repeat(1000) }).ok, true);
});

test('update with no fields sets nothing', () => {
  assert.deepEqual(threadUpdate({}), { ok: true, set: {} });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix server test 2>&1 | grep -E "threadFields|Cannot find"`
Expected: `Cannot find module '.../threadFields.js'`.

- [ ] **Step 3: Create `server/src/services/threadFields.js`**

```js
// Validation for plot-thread writes. Pure, so routes stay thin and it can be
// tested without Mongo. Only the fields a client may change are ever returned.
import { randomBytes } from 'node:crypto';

export const THREAD_LIMITS = { name: 80, description: 1000 };
export const THREAD_STATUSES = ['open', 'resolved'];
export const THREAD_PALETTE = ['#c9a96e', '#7fa7d9', '#d97f7f', '#8fc98f', '#b58fd9', '#d9a35f', '#6fc2c2', '#d98fb8'];
const FIELDS = ['name', 'color', 'description', 'status'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const newThreadId = (now = Date.now()) => `thr_${now}_${randomBytes(3).toString('hex')}`;
export const defaultThreadColor = (count) => THREAD_PALETTE[count % THREAD_PALETTE.length];

const fail = (field, message, code = 'INVALID_FIELD') => ({ ok: false, field, code, message });
const ok = (value) => ({ ok: true, value });

function check(field, value) {
  switch (field) {
    case 'name': {
      if (typeof value !== 'string') return fail('name', 'name must be text');
      const name = value.trim();
      if (!name) return fail('name', 'name is required');
      if (name.length > THREAD_LIMITS.name) return fail('name', `name must be at most ${THREAD_LIMITS.name} characters`);
      return ok(name);
    }
    case 'color':
      if (typeof value !== 'string' || !HEX.test(value)) return fail('color', 'color must be a #rrggbb colour');
      return ok(value.toLowerCase());
    case 'description': {
      if (typeof value !== 'string') return fail('description', 'description must be text');
      const description = value.trim();
      if (description.length > THREAD_LIMITS.description) {
        return fail('description', `description must be at most ${THREAD_LIMITS.description} characters`);
      }
      return ok(description);
    }
    case 'status':
      if (!THREAD_STATUSES.includes(value)) return fail('status', 'status must be open or resolved');
      return ok(value);
    default:
      return fail(field, `${field} cannot be set on a thread`);
  }
}

const bodyOf = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});

export function threadUpdate(body) {
  const src = bodyOf(body);
  const unknown = Object.keys(src).find((key) => !FIELDS.includes(key));
  if (unknown) return fail(unknown, `${unknown} cannot be set on a thread`);
  const set = {};
  for (const field of FIELDS) {
    if (!(field in src)) continue;
    const r = check(field, src[field]);
    if (!r.ok) return r;
    set[field] = r.value;
  }
  return { ok: true, set };
}

export function threadCreate(body) {
  const src = bodyOf(body);
  if (src.name === undefined || src.name === null || (typeof src.name === 'string' && !src.name.trim())) {
    return fail('name', 'name is required', 'MISSING_FIELD');
  }
  const r = threadUpdate(src);
  return r.ok ? ok(r.set) : r;
}
```

- [ ] **Step 4: Create `server/src/models/PlotThread.js`**

```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const plotThreadSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    order: { type: Number, default: 0 },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('PlotThread', plotThreadSchema);
```

- [ ] **Step 5: Run the server suite**

Run: `npm --prefix server test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/threadFields.js server/src/models/PlotThread.js server/test/threadFields.test.js
git commit -m "feat(threads): add the plot thread model and field validation"
```

---

### Task 3: Threads API with database tests (→ S2, S5)

**Files:**
- Create: `server/src/routes/threads.js`, `server/test/support/http.js`, `server/test/threads.routes.test.js`
- Modify: `server/src/server.js:51` (mount), `server/package.json` (dev deps), `.github/workflows/test.yml`

**Interfaces:**
- Consumes: Task 2's `threadCreate`, `threadUpdate`, `newThreadId`, `defaultThreadColor`, `PlotThread`.
- Produces: the HTTP API in the spec. `startDb(): Promise<() => Promise<void>>` and `buildApp(): express.Application` in `test/support/http.js`. The app sets `req.user = { id: <x-test-user header or 'user_a'> }` and mounts `/api/works` and `/api/works/:workId/threads`.

- [ ] **Step 1: Add the dev dependencies**

Run: `npm --prefix server install --save-dev mongodb-memory-server-core supertest`
Expected: both appear under `devDependencies` in `server/package.json`, and the lockfile updates.

- [ ] **Step 2: Create `server/test/support/http.js`**

```js
// HTTP tests against a real (in-memory) MongoDB. requireAuth is replaced by an
// x-test-user header so tests can act as different writers.
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import worksRouter from '../../src/routes/works.js';
import threadsRouter from '../../src/routes/threads.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

export async function startDb() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  return async () => {
    await mongoose.disconnect();
    await mongod.stop();
  };
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: req.get('x-test-user') || 'user_a' };
    next();
  });
  app.use('/api/works', worksRouter);
  app.use('/api/works/:workId/threads', threadsRouter);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 3: Write the failing route tests** in `server/test/threads.routes.test.js`

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import PlotThread from '../src/models/PlotThread.js';

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
  await Work.create([
    { _id: 'work_a', ownerId: 'user_a', title: 'A' },
    { _id: 'work_a2', ownerId: 'user_a', title: 'A2' },
    { _id: 'work_b', ownerId: 'user_b', title: 'B' },
  ]);
});

const base = (work = 'work_a') => `/api/works/${work}/threads`;
const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const create = (body, work = 'work_a', user = 'user_a') => call('post', base(work), user).send(body);

test('a writer creates, renames, recolours, describes and deletes a thread', async () => {
  const created = await create({ name: 'The missing heir' });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.match(id, /^thr_\d+_[0-9a-f]{6}$/);
  assert.equal(created.body.status, 'open');
  assert.equal(created.body.color, '#c9a96e');
  assert.equal(created.body.description, '');

  let res = await call('put', `${base()}/${id}`).send({ name: 'The lost heir' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'The lost heir');
  res = await call('put', `${base()}/${id}`).send({ color: '#7FA7D9' });
  assert.equal(res.body.color, '#7fa7d9');
  res = await call('put', `${base()}/${id}`).send({ description: '  Who is Ada really?  ' });
  assert.equal(res.body.description, 'Who is Ada really?');

  res = await call('get', base());
  assert.deepEqual(res.body.map((t) => t.name), ['The lost heir']);

  res = await call('delete', `${base()}/${id}`);
  assert.equal(res.status, 204);
  assert.equal(await PlotThread.countDocuments(), 0);
});

test('status moves between open and resolved', async () => {
  const { id } = (await create({ name: 'Debt' })).body;
  let res = await call('put', `${base()}/${id}`).send({ status: 'resolved' });
  assert.equal(res.body.status, 'resolved');
  res = await call('put', `${base()}/${id}`).send({ status: 'open' });
  assert.equal(res.body.status, 'open');
  res = await call('put', `${base()}/${id}`).send({ status: 'closed' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_FIELD');
});

test('new threads take the next palette colour and go last', async () => {
  for (const name of ['One', 'Two', 'Three']) await create({ name });
  const res = await call('get', base());
  assert.deepEqual(res.body.map((t) => [t.name, t.color, t.order]), [
    ['One', '#c9a96e', 0],
    ['Two', '#7fa7d9', 1],
    ['Three', '#d97f7f', 2],
  ]);
  const own = await create({ name: 'Four', color: '#123456' });
  assert.equal(own.body.color, '#123456');
});

test('bad fields are refused with 400', async () => {
  const cases = [
    [{}, 'MISSING_FIELD'],
    [{ name: '   ' }, 'MISSING_FIELD'],
    [{ name: 'x'.repeat(81) }, 'INVALID_FIELD'],
    [{ name: 'A', color: 'red' }, 'INVALID_FIELD'],
    [{ name: 'A', status: 'done' }, 'INVALID_FIELD'],
    [{ name: 'A', description: 'x'.repeat(1001) }, 'INVALID_FIELD'],
    [{ name: 'A', workId: 'work_b' }, 'INVALID_FIELD'],
  ];
  for (const [body, code] of cases) {
    const res = await create(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.code, code);
  }
  const { id } = (await create({ name: 'Ok' })).body;
  const res = await call('put', `${base()}/${id}`).send({ order: 3 });
  assert.equal(res.status, 400);
  assert.equal(await PlotThread.countDocuments(), 1);
});

test('names are unique per work, ignoring case and spaces', async () => {
  await create({ name: "Mara's debt" });
  let res = await create({ name: " mara's DEBT " });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'DUPLICATE_NAME');
  res = await create({ name: "Mara's debt" }, 'work_a2');
  assert.equal(res.status, 201);

  const other = (await create({ name: 'The storm' })).body;
  res = await call('put', `${base()}/${other.id}`).send({ name: "MARA'S DEBT" });
  assert.equal(res.status, 409);
  res = await call('put', `${base()}/${other.id}`).send({ name: 'THE STORM' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'THE STORM');
});

test('names with regex characters do not collide with others', async () => {
  assert.equal((await create({ name: 'Who (really) did it?' })).status, 201);
  assert.equal((await create({ name: 'Who .* did it?' })).status, 201);
  assert.equal((await create({ name: 'who (REALLY) did it?' })).status, 409);
});

test('reorder sets the order and refuses partial or foreign lists', async () => {
  const ids = [];
  for (const name of ['A', 'B', 'C']) ids.push((await create({ name })).body.id);
  let res = await call('put', `${base()}/reorder`).send({ ids: [ids[2], ids[0], ids[1]] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((t) => t.name), ['C', 'A', 'B']);

  const foreign = (await create({ name: 'X' }, 'work_a2')).body.id;
  for (const bad of [[ids[0], ids[1]], [ids[0], ids[0], ids[1]], [ids[0], ids[1], foreign], 'nope']) {
    res = await call('put', `${base()}/reorder`).send({ ids: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  res = await call('get', base());
  assert.deepEqual(res.body.map((t) => t.name), ['C', 'A', 'B']);
});

test("another writer can't reach the work's threads", async () => {
  const { id } = (await create({ name: 'Secret' })).body;
  const attempts = [
    call('get', base(), 'user_b'),
    call('post', base(), 'user_b').send({ name: 'Mine' }),
    call('put', `${base()}/${id}`, 'user_b').send({ name: 'Taken' }),
    call('put', `${base()}/reorder`, 'user_b').send({ ids: [id] }),
    call('delete', `${base()}/${id}`, 'user_b'),
  ];
  for (const res of await Promise.all(attempts)) {
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  }
  const thread = await PlotThread.findById(id).lean();
  assert.equal(thread.name, 'Secret');
  assert.equal(await PlotThread.countDocuments(), 1);
});

test('a thread id from another work of the same writer is not found', async () => {
  const { id } = (await create({ name: 'Elsewhere' }, 'work_a2')).body;
  assert.equal((await call('put', `${base()}/${id}`).send({ name: 'Moved' })).status, 404);
  assert.equal((await call('delete', `${base()}/${id}`)).status, 404);
  assert.equal((await PlotThread.findById(id).lean()).name, 'Elsewhere');
});

test('an unknown thread id is not found', async () => {
  const res = await call('put', `${base()}/thr_0_000000`).send({ name: 'Ghost' });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npm --prefix server test 2>&1 | grep -E "threads.routes|Cannot find"`
Expected: `Cannot find module '.../routes/threads.js'`. The first run may download mongod (~100 MB) into `~/.cache/mongodb-binaries`. If mongod won't start on this machine, stop and report it as a blocker.

- [ ] **Step 5: Create `server/src/routes/threads.js`**

```js
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
    next(err);
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
    next(err);
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
```

- [ ] **Step 6: Mount it in `server/src/server.js`**

Import next to the other routers:

```js
import threadsRouter from './routes/threads.js';
```

Mount after the map line:

```js
app.use('/api/works/:workId/threads', auth, threadsRouter);
```

- [ ] **Step 7: Run the server suite**

Run: `npm --prefix server test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: `fail 0`.

- [ ] **Step 8: Cache mongod in CI.** In `.github/workflows/test.yml`, add a job-level env and a cache step after `setup-node`:

```yaml
    env:
      MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-binaries
```

(place under `runs-on`), and

```yaml
      - if: matrix.package == 'server'
        uses: actions/cache@v4
        with:
          path: /home/runner/.cache/mongodb-binaries
          key: mongodb-binaries-${{ runner.os }}-${{ hashFiles('server/package-lock.json') }}
```

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/threads.js server/src/server.js server/package.json server/package-lock.json server/test/support/http.js server/test/threads.routes.test.js .github/workflows/test.yml
git commit -m "feat(threads): add the plot threads API with database tests"
```

---

### Task 4: Delete cleanup and work cascade (→ S4, S5)

**Files:**
- Create: `server/src/services/threadCleanup.js`, `server/test/threads.delete.test.js`
- Modify: `server/src/routes/threads.js` (DELETE handler), `server/src/services/workService.js:9-19`

**Interfaces:**
- Consumes: `stripThreadFromHtml` (Task 1), `sceneSummaries` (Task 1), `PlotThread` (Task 2), `startDb`/`clearDb`/`buildApp` (Task 3).
- Produces: `removeThreadFromWork(workId: string, threadId: string): Promise<boolean>`. Returns `false` when the thread isn't in that work.

- [ ] **Step 1: Write the failing tests** in `server/test/threads.delete.test.js`

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Snapshot from '../src/models/Snapshot.js';
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
  await Work.create([
    { _id: 'work_a', ownerId: 'user_a', title: 'A' },
    { _id: 'work_a2', ownerId: 'user_a', title: 'A2' },
  ]);
});

const call = (method, path) => request(app)[method](path).set('x-test-user', 'user_a');
const create = async (name, work = 'work_a') => (await call('post', `/api/works/${work}/threads`).send({ name })).body.id;
const hr = (id, threads) => `<hr data-scene="${id}"${threads ? ` data-threads="${threads}"` : ''} data-status="draft" />`;

async function chapter(_id, workId, contentHtml, threadIds = []) {
  await Chapter.create({ _id, workId, title: _id, contentHtml, threadIds, scenes: sceneSummaries(contentHtml) });
}

test('deleting a thread strips it from chapter tags, scene markers and derived scenes', async () => {
  const a = await create('Heir');
  const b = await create('Storm');
  const html = `${hr('scn_1', `${a} ${b}`)}<div>One.</div>${hr('scn_2', a)}<div>Two.</div>`;
  await chapter('ch_1', 'work_a', html, [a, b]);
  await chapter('ch_2', 'work_a', '<div>Untouched.</div>');
  await Snapshot.create({ _id: 'snap_1', workId: 'work_a', chapterId: 'ch_1', kind: 'auto', contentHtml: html, createdAt: new Date().toISOString() });

  assert.equal((await call('delete', `/api/works/work_a/threads/${a}`)).status, 204);

  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, [b]);
  assert.equal(ch.contentHtml, `${hr('scn_1', b)}<div>One.</div>${hr('scn_2')}<div>Two.</div>`);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [[b], []]);
  assert.equal((await Chapter.findById('ch_2').lean()).contentHtml, '<div>Untouched.</div>');
  assert.equal((await Snapshot.findById('snap_1').lean()).contentHtml, html);

  await call('delete', `/api/works/work_a/threads/${b}`);
  const after = await Chapter.findById('ch_1').lean();
  assert.deepEqual(after.threadIds, []);
  assert.doesNotMatch(after.contentHtml, /data-threads/);
});

test('a tag id that only starts with the deleted id is kept', async () => {
  const a = await create('Short');
  const longer = `${a}ff`;
  await chapter('ch_1', 'work_a', `${hr('scn_1', `${a} ${longer}`)}<div>One.</div>`, [a, longer]);

  await call('delete', `/api/works/work_a/threads/${a}`);

  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, [longer]);
  assert.equal(ch.contentHtml, `${hr('scn_1', longer)}<div>One.</div>`);
});

test("cleanup doesn't touch another work's chapters", async () => {
  const a = await create('Heir');
  const html = `${hr('scn_1', a)}<div>Stray.</div>`;
  await chapter('ch_x', 'work_a2', html, [a]);

  await call('delete', `/api/works/work_a/threads/${a}`);

  const ch = await Chapter.findById('ch_x').lean();
  assert.equal(ch.contentHtml, html);
  assert.deepEqual(ch.threadIds, [a]);
});

test('deleting a work deletes its threads', async () => {
  await create('Heir');
  await create('Storm');
  await create('Kept', 'work_a2');

  assert.equal((await call('delete', '/api/works/work_a')).status, 204);

  assert.equal(await PlotThread.countDocuments({ workId: 'work_a' }), 0);
  assert.equal(await PlotThread.countDocuments({ workId: 'work_a2' }), 1);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix server test 2>&1 | grep -E "^✖"`
Expected: the first three fail because the chapters still carry the tags. The last fails because the threads remain.

- [ ] **Step 3: Create `server/src/services/threadCleanup.js`**

```js
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
    await Chapter.updateOne({ _id: ch._id, workId }, { $set: set });
  }
  return true;
}
```

- [ ] **Step 4: Use it in the DELETE route** (`server/src/routes/threads.js`)

```js
import { removeThreadFromWork } from '../services/threadCleanup.js';
```

```js
// DELETE /api/works/:workId/threads/:threadId — also removes its tags
router.delete('/:threadId', async (req, res, next) => {
  try {
    const { workId, threadId } = req.params;
    if (!(await removeThreadFromWork(workId, threadId))) return next(notFound());
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Cascade on work delete** in `server/src/services/workService.js`

Add `import PlotThread from '../models/PlotThread.js';` with the other model imports, and `PlotThread.deleteMany({ workId }),` inside the `Promise.all` list of `deleteWorkCascade`.

- [ ] **Step 6: Run the server suite**

Run: `npm --prefix server test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/threadCleanup.js server/src/routes/threads.js server/src/services/workService.js server/test/threads.delete.test.js
git commit -m "feat(threads): strip a deleted thread's tags from its work"
```

---

### Task 5: Tags survive the editor (→ S1)

The client rewrites markers whenever the writer edits a scene card. Without this task, a tag added in the next story would be wiped by any card edit.

**Files:**
- Create: `client/src/utils/threads.js`
- Modify: `client/src/utils/scenes.js:17-25, 77-96`
- Test: `client/test/sceneThreads.test.js` (new)

**Interfaces:**
- Produces in `utils/threads.js`:
  - `THREAD_LIMITS = { name: 80, description: 1000 }`, `THREAD_PALETTE` (same 8 colours as the server)
  - `parseThreadIds(value): string[]` (same rules as the server)
  - `threadNameError(name): string | null`, `threadDescriptionError(text): string | null`
  - `threadTagCount(chapters, threadId): number`
  - `deleteMessage(name, count): string`
- Scene objects from `sceneList` gain `threadIds`. `markerHtml` writes `data-threads` from `fields.threadIds`. `applyCard` changes `data-threads` only when `'threadIds' in fields`.

- [ ] **Step 1: Write the failing tests** in `client/test/sceneThreads.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sceneList, markerHtml, applyCard } from '../src/utils/scenes.js';
import {
  parseThreadIds,
  threadTagCount,
  deleteMessage,
  threadNameError,
  threadDescriptionError,
} from '../src/utils/threads.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

test('scenes read their thread ids from the marker', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1 thr_2" data-status="draft"><div>A.</div><hr data-scene="scn_b" data-status="draft"><div>B.</div>');
  assert.deepEqual(sceneList(root).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
});

test('markerHtml writes thread ids only when there are some', () => {
  assert.match(markerHtml({ id: 'scn_a', threadIds: ['thr_1', 'thr_2'] }), /data-threads="thr_1 thr_2"/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: [] }), /data-threads/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a' }), /data-threads/);
});

test('editing a scene card keeps its thread tags', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  applyCard(marker, { title: 'New title', pov: '', location: '', status: 'revise', summary: '' });
  assert.equal(marker.getAttribute('data-threads'), 'thr_1');
  assert.equal(marker.getAttribute('data-title'), 'New title');
});

test('applyCard sets or clears tags when threadIds is given', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  applyCard(marker, { status: 'draft', threadIds: ['thr_2', 'bad id', 'thr_3'] });
  assert.equal(marker.getAttribute('data-threads'), 'thr_2 thr_3');
  applyCard(marker, { status: 'draft', threadIds: [] });
  assert.equal(marker.hasAttribute('data-threads'), false);
});

test('parseThreadIds matches the server rules', () => {
  assert.deepEqual(parseThreadIds(' thr_1  javascript:x thr_1 thr_2 '), ['thr_1', 'thr_2']);
  assert.deepEqual(parseThreadIds(null), []);
});

test('threadTagCount counts tagged chapters and scenes', () => {
  const chapters = [
    { id: 'c1', threadIds: ['thr_1'], scenes: [{ threadIds: ['thr_1'] }, { threadIds: [] }] },
    { id: 'c2', scenes: [{ threadIds: ['thr_1', 'thr_2'] }] },
    { id: 'c3' },
  ];
  assert.equal(threadTagCount(chapters, 'thr_1'), 3);
  assert.equal(threadTagCount(chapters, 'thr_9'), 0);
});

test('deleteMessage mentions tags only when there are some', () => {
  assert.equal(deleteMessage('Heir', 0), 'Delete "Heir"?');
  assert.equal(deleteMessage('Heir', 1), 'Delete "Heir"? It\'s tagged on 1 chapter or scene; the tag will be removed.');
  assert.equal(deleteMessage('Heir', 3), 'Delete "Heir"? It\'s tagged on 3 chapters and scenes; the tags will be removed.');
});

test('client field checks match the server limits', () => {
  assert.equal(threadNameError('  '), 'Name is required');
  assert.equal(threadNameError('x'.repeat(81)), 'Name must be at most 80 characters');
  assert.equal(threadNameError(' Heir '), null);
  assert.equal(threadDescriptionError('x'.repeat(1001)), 'Description must be at most 1000 characters');
  assert.equal(threadDescriptionError(''), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix client test 2>&1 | grep -E "sceneThreads|Cannot find"`
Expected: `Cannot find module '.../utils/threads.js'`.

- [ ] **Step 3: Create `client/src/utils/threads.js`**

```js
// Plot threads on the client. Limits and tag rules match the server
// (server/src/services/threadFields.js and threadTags.js).
export const THREAD_LIMITS = { name: 80, description: 1000 };
export const THREAD_PALETTE = ['#c9a96e', '#7fa7d9', '#d97f7f', '#8fc98f', '#b58fd9', '#d9a35f', '#6fc2c2', '#d98fb8'];

const THREAD_ID = /^thr_[A-Za-z0-9_]{1,60}$/;
const MAX_TAGS = 50;

export function parseThreadIds(value) {
  if (typeof value !== 'string') return [];
  const ids = [];
  for (const id of value.split(/\s+/)) {
    if (ids.length >= MAX_TAGS) break;
    if (THREAD_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function threadNameError(name) {
  const value = (name || '').trim();
  if (!value) return 'Name is required';
  if (value.length > THREAD_LIMITS.name) return `Name must be at most ${THREAD_LIMITS.name} characters`;
  return null;
}

export function threadDescriptionError(text) {
  if ((text || '').trim().length > THREAD_LIMITS.description) {
    return `Description must be at most ${THREAD_LIMITS.description} characters`;
  }
  return null;
}

// Chapters plus scenes that carry the thread
export function threadTagCount(chapters, threadId) {
  let count = 0;
  for (const ch of chapters || []) {
    if ((ch.threadIds || []).includes(threadId)) count += 1;
    for (const scene of ch.scenes || []) if ((scene.threadIds || []).includes(threadId)) count += 1;
  }
  return count;
}

export function deleteMessage(name, count) {
  const ask = `Delete "${name}"?`;
  if (!count) return ask;
  if (count === 1) return `${ask} It's tagged on 1 chapter or scene; the tag will be removed.`;
  return `${ask} It's tagged on ${count} chapters and scenes; the tags will be removed.`;
}
```

- [ ] **Step 4: Round-trip `data-threads` in `client/src/utils/scenes.js`**

```js
import { parseThreadIds } from './threads.js';
```

`cardOf`:

```js
function cardOf(marker) {
  if (!marker) return { id: null, title: '', pov: '', location: '', status: 'draft', summary: '', threadIds: [] };
  const card = { id: marker.getAttribute('data-scene') };
  for (const [field, attr] of Object.entries(ATTRS)) card[field] = marker.getAttribute(attr) || '';
  const status = marker.getAttribute('data-status');
  card.status = SCENE_STATUSES.includes(status) ? status : 'draft';
  card.threadIds = parseThreadIds(marker.getAttribute('data-threads'));
  return card;
}
```

`markerHtml`: after the ATTRS loop, before `data-status`:

```js
  const threads = parseThreadIds((fields.threadIds || []).join(' '));
  if (threads.length) attrs.push(`data-threads="${escapeAttr(threads.join(' '))}"`);
```

`applyCard`: after the ATTRS loop, before `data-status`:

```js
  // Card edits don't carry tags; only change them when asked to
  if ('threadIds' in fields) {
    const threads = parseThreadIds((fields.threadIds || []).join(' '));
    if (threads.length) marker.setAttribute('data-threads', threads.join(' '));
    else marker.removeAttribute('data-threads');
  }
```

- [ ] **Step 5: Run the client suite**

Run: `npm --prefix client test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: `fail 0`. If an existing `scenes.test.js` deepEqual on a scene card fails because of the new `threadIds` key, add `threadIds: []` to that expectation.

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/threads.js client/src/utils/scenes.js client/test/
git commit -m "feat(threads): keep scene thread tags through editor card edits"
```

---

### Task 6: Thread manager on the Map (→ S3)

**Files:**
- Create: `client/src/components/map/ThreadManager.jsx`, `client/src/components/map/ThreadRow.jsx`, `client/test/threadManager.test.js`
- Modify: `client/src/context/ActiveWorkContext.jsx`, `client/src/pages/MapView.jsx`, `client/src/index.css` (after the `.beat-row` rules, ~line 1630), `client/test/support/render.js` (helpers)

**Interfaces:**
- Consumes: `utils/threads.js` (Task 5), the API (Tasks 3–4).
- Produces: `ActiveWorkContext` `state.threads: Thread[]` and `refreshThreads(workId): Promise<void>`. `<ThreadManager workId threads chapters onChanged />`, where `onChanged` is an async function called after every successful write. Test helpers `press(el, key)` and `blur(el)`.

- [ ] **Step 1: Add the test helpers** to `client/test/support/render.js` (after `click`):

```js
// Presses a key on an element (React reads event.key)
export async function press(el, key) {
  await act(async () => {
    const event = new window.Event('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: key });
    el.dispatchEvent(event);
  });
  await flush();
}

// React's onBlur listens for focusout
export async function blur(el) {
  await act(async () => {
    el.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  });
  await flush();
}
```

- [ ] **Step 2: Write the failing component tests** in `client/test/threadManager.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp, HttpError } from './support/app.js';
import { click, type, press, blur } from './support/render.js';
import ThreadManager from '../src/components/map/ThreadManager.jsx';

const heir = { id: 'thr_1', name: 'The missing heir', color: '#c9a96e', description: 'Who is Ada?', status: 'open', order: 0 };
const chapters = [
  { id: 'c1', title: 'One', threadIds: ['thr_1'], scenes: [{ id: 'scn_a', threadIds: ['thr_1'] }, { id: 'scn_b', threadIds: [] }] },
];

function mount({ threads = [heir], routes = {} } = {}) {
  let changed = 0;
  const onChanged = async () => {
    changed += 1;
  };
  return renderApp(h(ThreadManager, { workId: 'w1', threads, chapters, onChanged }), { routes }).then((view) => ({
    ...view,
    changed: () => changed,
    writes: () => view.fetch.calls.filter((c) => c.path.startsWith('/works/w1/threads')),
  }));
}

test('shows an empty state with no threads', async () => {
  const view = await mount({ threads: [] });
  assert.match(view.text(), /No plot threads yet/);
  await view.unmount();
});

test('lists threads with their status and description', async () => {
  const view = await mount();
  assert.match(view.text(), /The missing heir/);
  assert.match(view.text(), /Who is Ada\?/);
  assert.equal(view.query('.thread-status').textContent, 'Open');
  await view.unmount();
});

test('creates a thread from the new-thread field', async () => {
  const view = await mount({ routes: { 'POST /works/w1/threads': { id: 'thr_2', name: 'Lost letter' } } });
  await click(view.button('New thread'));
  const input = view.query('.thread-new-name');
  await type(input, '  Lost letter ');
  await press(input, 'Enter');
  assert.deepEqual(view.writes(), [{ method: 'POST', path: '/works/w1/threads', body: { name: 'Lost letter' } }]);
  assert.equal(view.changed(), 1);
  assert.equal(view.query('.thread-new-name'), null);
  await view.unmount();
});

test('toggles the status', async () => {
  const view = await mount();
  await click(view.query('.thread-status'));
  assert.deepEqual(view.writes(), [{ method: 'PUT', path: '/works/w1/threads/thr_1', body: { status: 'resolved' } }]);
  await view.unmount();
});

test('renames, and keeps the typed name when the server refuses it', async () => {
  const view = await mount({
    routes: { 'PUT /works/w1/threads/thr_1': new HttpError(409, 'DUPLICATE_NAME', 'A thread named "Debt" already exists') },
  });
  await click(view.query('.thread-name'));
  const input = view.query('.thread-name-input');
  await type(input, 'Debt');
  await press(input, 'Enter');
  assert.deepEqual(view.writes()[0].body, { name: 'Debt' });
  assert.match(view.text(), /A thread named "Debt" already exists/);
  assert.equal(view.query('.thread-name-input').value, 'Debt');
  assert.equal(view.changed(), 0);
  await view.unmount();
});

test('recolours from the palette', async () => {
  const view = await mount();
  await click(view.query('.thread-swatch'));
  await click(view.query('[aria-label="Colour #7fa7d9"]'));
  assert.deepEqual(view.writes()[0].body, { color: '#7fa7d9' });
  assert.equal(view.query('.thread-palette'), null);
  await view.unmount();
});

test('edits the description on blur', async () => {
  const view = await mount();
  await click(view.query('.thread-desc'));
  const area = view.query('.thread-desc-input');
  await type(area, 'Ada is the heir.');
  await blur(area);
  assert.deepEqual(view.writes()[0].body, { description: 'Ada is the heir.' });
  await view.unmount();
});

test('asks before deleting and says how many tags go', async () => {
  const view = await mount();
  await click(view.button('Delete'));
  assert.match(view.text(), /Delete "The missing heir"\? It's tagged on 2 chapters and scenes/);
  assert.equal(view.writes().length, 0);
  await click(view.button('Delete thread'));
  assert.deepEqual(view.writes(), [{ method: 'DELETE', path: '/works/w1/threads/thr_1', body: undefined }]);
  assert.equal(view.changed(), 1);
  await view.unmount();
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm --prefix client test 2>&1 | grep -E "threadManager|Cannot find"`
Expected: `Cannot find module '.../ThreadManager.jsx'`.

- [ ] **Step 4: Create `client/src/components/map/ThreadRow.jsx`**

```jsx
import { useRef, useState } from 'react';
import { THREAD_PALETTE, threadNameError, threadDescriptionError, deleteMessage } from '../../utils/threads.js';

// One plot thread. onSave(fields) resolves true when the server accepted it;
// a refused edit stays open with what the writer typed.
export default function ThreadRow({ thread, tagCount, error, onSave, onDelete }) {
  const [name, setName] = useState(null); // null = not editing
  const [desc, setDesc] = useState(null);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState(thread.color);
  const [confirming, setConfirming] = useState(false);
  const saving = useRef(false);

  const commit = async (fields, close) => {
    if (saving.current) return;
    saving.current = true;
    try {
      if (await onSave(fields)) close();
    } finally {
      saving.current = false;
    }
  };

  const nameError = name !== null ? threadNameError(name) : null;
  const saveName = () => {
    if (name === null || nameError) return;
    const next = name.trim();
    if (next === thread.name) return setName(null);
    commit({ name: next }, () => setName(null));
  };
  const onNameKey = (e) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') setName(null);
  };

  const descError = desc !== null ? threadDescriptionError(desc) : null;
  const saveDesc = () => {
    if (desc === null || descError) return;
    const next = desc.trim();
    if (next === thread.description) return setDesc(null);
    commit({ description: next }, () => setDesc(null));
  };

  const pickColor = (color) => commit({ color }, () => setPicking(false));
  const toggleStatus = () => commit({ status: thread.status === 'open' ? 'resolved' : 'open' }, () => {});

  return (
    <li className={`thread-row thread-row--${thread.status}`}>
      <div className="thread-row-main">
        <button
          className="thread-swatch"
          style={{ background: thread.color }}
          aria-label="Change colour"
          title="Change colour"
          onClick={() => {
            setCustom(thread.color);
            setPicking(!picking);
          }}
        />
        {name === null ? (
          <button className="thread-name" onClick={() => setName(thread.name)} title="Rename">
            {thread.name}
          </button>
        ) : (
          <input
            className="form-input thread-name-input"
            aria-label="Thread name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={saveName}
            autoFocus
          />
        )}
        <button
          className={`thread-status thread-status--${thread.status}`}
          aria-pressed={thread.status === 'resolved'}
          title={thread.status === 'open' ? 'Mark resolved' : 'Reopen'}
          onClick={toggleStatus}
        >
          {thread.status === 'open' ? 'Open' : 'Resolved'}
        </button>
        {!confirming && (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {picking && (
        <div className="thread-palette">
          {THREAD_PALETTE.map((color) => (
            <button
              key={color}
              className={`thread-palette-color${color === thread.color ? ' current' : ''}`}
              style={{ background: color }}
              aria-label={`Colour ${color}`}
              onClick={() => pickColor(color)}
            />
          ))}
          <input type="color" aria-label="Custom colour" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => pickColor(custom)}>
            Use colour
          </button>
        </div>
      )}
      {desc === null ? (
        <button className="thread-desc" onClick={() => setDesc(thread.description)}>
          {thread.description ? thread.description.split('\n')[0] : 'Add a description'}
        </button>
      ) : (
        <textarea
          className="form-input thread-desc-input"
          aria-label="Thread description"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setDesc(null)}
          onBlur={saveDesc}
          autoFocus
        />
      )}
      {nameError && <p className="field-error">{nameError}</p>}
      {descError && <p className="field-error">{descError}</p>}
      {error && <p className="field-error">{error}</p>}
      {confirming && (
        <div className="thread-confirm">
          <p>{deleteMessage(thread.name, tagCount)}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Delete thread
          </button>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Create `client/src/components/map/ThreadManager.jsx`**

```jsx
import { useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import ThreadRow from './ThreadRow.jsx';
import { threadNameError, threadTagCount } from '../../utils/threads.js';

// The work's plot threads, on the Map. Every write reloads the list via onChanged.
export default function ThreadManager({ workId, threads, chapters, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [errors, setErrors] = useState({});
  const creating = useRef(false);
  const base = `/works/${workId}/threads`;

  // Resolves true on success; on failure the server's message shows under the row
  const run = async (key, write) => {
    try {
      await write();
      setErrors((e) => ({ ...e, [key]: null }));
      await onChanged();
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message }));
      return false;
    }
  };

  const cancelNew = () => {
    setAdding(false);
    setNewName('');
    setErrors((e) => ({ ...e, new: null }));
  };
  const newError = newName.trim() ? threadNameError(newName) : null;
  const create = async () => {
    if (creating.current) return;
    if (!newName.trim()) return cancelNew();
    if (newError) return;
    creating.current = true;
    try {
      if (await run('new', () => api.post(base, { name: newName.trim() }))) {
        setAdding(false);
        setNewName('');
      }
    } finally {
      creating.current = false;
    }
  };
  const onNewKey = (e) => {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') cancelNew();
  };

  return (
    <section className="thread-manager">
      <div className="thread-manager-head">
        <h3 className="thread-manager-title">Plot threads</h3>
        {!adding && (
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            New thread
          </button>
        )}
      </div>
      {threads.length === 0 && !adding && (
        <p className="chapter-detail-muted">No plot threads yet. Add the subplots and mysteries you need to keep track of.</p>
      )}
      <ul className="thread-list">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            tagCount={threadTagCount(chapters, thread.id)}
            error={errors[thread.id]}
            onSave={(fields) => run(thread.id, () => api.put(`${base}/${thread.id}`, fields))}
            onDelete={() => run(thread.id, () => api.delete(`${base}/${thread.id}`))}
          />
        ))}
        {adding && (
          <li className="thread-row thread-new">
            <input
              className="form-input thread-new-name"
              aria-label="New thread name"
              placeholder="Name the thread"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={onNewKey}
              onBlur={create}
              autoFocus
            />
            {newError && <p className="field-error">{newError}</p>}
            {errors.new && <p className="field-error">{errors.new}</p>}
          </li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Run the component tests**

Run: `npm --prefix client test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"`
Expected: `fail 0`. If `press`/`blur` don't reach React handlers under linkedom, fix the helper (e.g. dispatch `blur` as well as `focusout`), not the components.

- [ ] **Step 7: Wire threads into `ActiveWorkContext.jsx`**

Add `threads: []` to `initialState`, a reducer case

```js
    case 'SET_THREADS':
      return { ...state, threads: action.threads };
```

and a loader next to `refreshMap`:

```js
  const refreshThreads = useCallback(async (workId) => {
    try {
      const threads = await api.get(`/works/${workId}/threads`);
      dispatch({ type: 'SET_THREADS', threads });
    } catch (err) {
      console.error('Failed to refresh threads:', err);
    }
  }, []);
```

Add `refreshThreads` to the provider `value`.

- [ ] **Step 8: Mount on the Map** in `client/src/pages/MapView.jsx`

```jsx
import ThreadManager from '../components/map/ThreadManager.jsx';
```

```jsx
  const { state, loadWork, refreshMap, refreshThreads } = useActiveWork();
```

```jsx
  useEffect(() => {
    if (workId) {
      loadWork(workId);
      refreshMap(workId);
      refreshThreads(workId);
    }
  }, [workId, loadWork, refreshMap, refreshThreads]);
```

Between the `map-blocks-section` div and the `map-detail-section` div:

```jsx
      <div className="map-threads-section">
        <ThreadManager
          workId={workId}
          threads={state.threads}
          chapters={state.chapters}
          onChanged={() => refreshThreads(workId)}
        />
      </div>
```

- [ ] **Step 9: Styles** in `client/src/index.css`, after the `.beat-row` rules:

```css
.map-threads-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.thread-manager-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.thread-manager-title { margin: 0; font-family: Georgia, serif; color: var(--gold); font-size: 1rem; font-weight: normal; }
.thread-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.thread-row { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.thread-row--resolved .thread-name { color: var(--text-muted); text-decoration: line-through; }
.thread-row-main { display: flex; align-items: center; gap: 8px; }
.thread-swatch { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--border); padding: 0; cursor: pointer; flex: none; }
.thread-name { flex: 1; text-align: left; background: none; border: none; color: var(--text); font-family: Georgia, serif; font-size: 0.95rem; cursor: text; padding: 2px 0; }
.thread-name-input { flex: 1; }
.thread-status { border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; font-size: 0.75rem; padding: 2px 8px; cursor: pointer; }
.thread-status--open { color: var(--gold); border-color: var(--gold-dim); }
.thread-status--resolved { color: var(--success); }
.thread-desc { text-align: left; background: none; border: none; color: var(--text-muted); font-size: 0.8rem; cursor: text; padding: 0 0 0 24px; }
.thread-desc-input { margin-left: 24px; width: calc(100% - 24px); }
.thread-palette { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-left: 24px; }
.thread-palette-color { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; padding: 0; cursor: pointer; }
.thread-palette-color.current { border-color: var(--text); }
.thread-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-muted); }
.thread-confirm p { margin: 0; flex-basis: 100%; }
```

- [ ] **Step 10: Run the client suite and build**

Run: `npm --prefix client test 2>&1 | grep -E "^ℹ (pass|fail)|^✖"` and then `npm --prefix client run build 2>&1 | tail -3`
Expected: `fail 0`, and the build completes with no errors.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/map/ThreadManager.jsx client/src/components/map/ThreadRow.jsx client/src/context/ActiveWorkContext.jsx client/src/pages/MapView.jsx client/src/index.css client/test/
git commit -m "feat(threads): manage plot threads from the Map"
```

---

### Task 7: Verify end to end

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full suites**

Run: `npm --prefix server test 2>&1 | tail -8` and `npm --prefix client test 2>&1 | tail -8`
Expected: `fail 0` in both. Record the pass counts. The baseline was server 190 and client 151; both should be higher now.

- [ ] **Step 2: Real app walk** (dev stack with `DEV_AUTH_BYPASS=true`; see the hub gotchas for Podman). Open a work's Map and:
  1. Create "The missing heir" and "Mara's debt". Check the colours are gold, then blue.
  2. Try creating "mara's DEBT". The duplicate message shows under the new field.
  3. Rename one, recolour it with a palette colour and with a custom colour, add a description, mark it resolved, then reopen it.
  4. Reload the page. Everything persists.
  5. With `mongosh`, add `data-threads="<id>"` to a scene marker in one chapter and `<id>` to its `threadIds`. Delete that thread in the UI. The prompt says "tagged on 2 chapters and scenes". After the delete, the chapter's `contentHtml` and `threadIds` no longer carry the id, and the chapter's snapshots still do.
  6. Edit that chapter's scene card in the Scenes tab, then confirm in `mongosh` that a remaining `data-threads` attribute survives the save.

- [ ] **Step 3: Note the CI cache step** for the PR description (it can only be checked on the first CI run).

---

## Acceptance → proof

| Criterion | Proven by |
|---|---|
| A1 creates, renames, recolours, describes, deletes | `threads.routes.test.js` "a writer creates, renames, recolours, describes and deletes a thread"; `threadManager.test.js` create/rename/recolour/description/delete tests; Task 7 step 2.1–2.4 |
| A2 status open/resolved, changeable | `threads.routes.test.js` "status moves between open and resolved"; `threadManager.test.js` "toggles the status" |
| A3 stored per work, owner only (loadWork) | `threads.routes.test.js` "another writer can't reach the work's threads" and "a thread id from another work of the same writer is not found"; route uses `router.use(loadWork)` |
| A4 delete removes it from everything tagged | `threads.delete.test.js` (chapter tags, scene markers, derived scenes, exact-id, other work untouched); `threadTags.test.js` strip tests; Task 7 step 2.5 |
| A5 tests cover CRUD + ownership | the two HTTP test files above passing locally and in CI (`test (server)` job) |

## Subtask → tasks

| Subtask | Tasks |
|---|---|
| S1 Decide Q-1 | Decided in the spec (scenes and chapters); format built in Task 1, kept through editor in Task 5 |
| S2 Data model and API | Tasks 2, 3 |
| S3 Thread manager UI | Task 6 |
| S4 Delete cleanup | Tasks 1, 4 |
| S5 Tests | Tasks 3, 4 (database harness and HTTP tests) |
