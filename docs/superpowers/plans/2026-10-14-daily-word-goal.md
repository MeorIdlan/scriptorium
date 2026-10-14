# Daily word goal with live progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer sets a daily word goal and sees today's net words added, updating as they type, resetting at midnight in their own timezone.

**Architecture:** Each chapter save adds the gain (`max(0, new − old)`) to a per-writer `DailyProgress` document for the day, read atomically from the pre-update chapter. The day key comes from the browser's IANA timezone sent as `X-Timezone`. The goal lives on the user's `Settings` document. The client shows the server's total plus the editor's unsaved gain and refetches after each save.

**Tech Stack:** Express 4 + Mongoose (server, `node --test`, `supertest`, in-memory Mongo), React 18 + Vite (client, `node --test` with `linkedom`), Intl.DateTimeFormat for timezones.

**Spec:** `docs/superpowers/specs/2026-10-14-daily-word-goal-design.md` (approved, commit f476a7d). Trello: https://trello.com/c/nDeLSYIe

## Global Constraints

- Daily goal: integer from 1 to 100000, or `null` for no goal. Anything else is a 400 `INVALID_GOAL`.
- Day key: `YYYY-MM-DD` in the writer's IANA timezone, from the `X-Timezone` header. A missing or invalid zone uses `UTC` and never fails a request.
- Counting: gains only. Each chapter save adds `max(0, newWords − oldWords)`. Deletes and moves across a single save add nothing.
- Counting point: only `PUT /api/works/:workId/chapters/:chapterId` counts. Restores, bring-backs and deletes do not.
- Per writer: the goal and today's count belong to the signed-in user. Use `req.user.id`, not `loadWork`.
- A failed progress write is logged and never fails the chapter save.
- `Session.js` and `routes/sessions.js` are not changed.

## Review Focus

1. Missing or invalid `X-Timezone` → counts under the UTC day and the save still returns 200. Pinned by Task 2 (`dayKeyForRequest` tests) and Task 4 (HTTP fallback test).
2. Two tabs autosaving the same chapter at once → today's total equals the chapter's real growth, with no double count. Pinned by Task 4 (concurrent saves test).
3. Goal of `0`, a negative number, `2.5`, the string `"500"`, `100001`, or no body → 400 and nothing saved. Pinned by Task 3 (invalid goals test).
4. A writer with no `Settings` document and no progress rows → `/today` returns `words: 0, goal: null`, not a 500. Pinned by Task 3 (empty state test).
5. A zone with a non-hour offset (`Asia/Kathmandu`, UTC+05:45) rolls over at its own local midnight. Pinned by Task 1 (zone rollover test) and Task 4 (boundary test).

---

## File Structure

- `server/src/services/wordCountService.js` (modify): add `gainFor` and `dayKey`. Pure, no DB.
- `server/src/models/DailyProgress.js` (create): one document per writer per day.
- `server/src/services/progressService.js` (create): request day key, daily totals, goal read/write, goal validation.
- `server/src/models/Settings.js` (modify): add `dailyWordGoal`.
- `server/src/routes/progress.js` (create): `GET /today`, `PUT /goal`.
- `server/src/server.js` (modify): mount `/api/progress` behind `auth`.
- `server/test/support/http.js` (modify): mount the progress router in the test app.
- `server/src/routes/chapters.js` (modify): count gains in `PUT /:chapterId`.
- `client/src/utils/dailyProgress.js` (create): pure helpers (`browserTimeZone`, `pendingGain`, `progressView`, `parseGoalInput`).
- `client/src/utils/api.js` (modify): send `X-Timezone` on every request.
- `client/src/hooks/useDailyProgress.js` (create): fetches `/today`, tracks the editor's unsaved gain.
- `client/src/components/editor/WordCounter.jsx` (modify): show today's progress.
- `client/src/index.css` (modify): styles for the daily line and bar.
- `client/src/pages/Settings.jsx` (modify): daily goal field. Confirm the path at execution.

---

### Task 1: Day key and gain rules (→ S2, S5)

Proves A3 (midnight in the writer's zone) and A4 (deletes add nothing).

**Files:**
- Modify: `server/src/services/wordCountService.js`
- Test: `server/test/progressRules.test.js`

**Interfaces:**
- Produces: `gainFor(oldWords: number, newWords: number): number`; `dayKey(date: Date, timeZone: string): string` returning `YYYY-MM-DD`, throws `RangeError` for an unknown zone.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```js
// server/test/progressRules.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gainFor, dayKey } from '../src/services/wordCountService.js';

test('a save adds only the increase in words', () => {
  assert.equal(gainFor(100, 130), 30);
});

test('deleting or moving text adds nothing (A4)', () => {
  assert.equal(gainFor(130, 100), 0);
  assert.equal(gainFor(130, 130), 0);
});

test('the day flips at local midnight in the writer zone (A3)', () => {
  // Kuala Lumpur is UTC+8: 23:59 on 14 Oct, then 00:01 on 15 Oct
  assert.equal(dayKey(new Date('2026-10-14T15:59:00Z'), 'Asia/Kuala_Lumpur'), '2026-10-14');
  assert.equal(dayKey(new Date('2026-10-14T16:01:00Z'), 'Asia/Kuala_Lumpur'), '2026-10-15');
});

test('a zone with a non-hour offset rolls over at its own midnight (review focus 5)', () => {
  // Kathmandu is UTC+05:45: 23:59 on 14 Oct, then 00:01 on 15 Oct
  assert.equal(dayKey(new Date('2026-10-14T18:14:00Z'), 'Asia/Kathmandu'), '2026-10-14');
  assert.equal(dayKey(new Date('2026-10-14T18:16:00Z'), 'Asia/Kathmandu'), '2026-10-15');
});

test('an unknown zone throws a RangeError so callers can fall back', () => {
  assert.throws(() => dayKey(new Date(), 'Mars/Olympus'), RangeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/progressRules.test.js`
Expected: FAIL with "gainFor is not a function" (the import has no export yet).

- [ ] **Step 3: Write minimal implementation**

Append to `server/src/services/wordCountService.js`:

```js
// Words added by a save. Decreases are ignored, so deleting or moving text never lowers the day (A4).
export function gainFor(oldWords, newWords) {
  return Math.max(0, newWords - oldWords);
}

// The calendar date for `date` in an IANA timezone, as YYYY-MM-DD. Throws RangeError for an unknown zone.
export function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/progressRules.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/wordCountService.js server/test/progressRules.test.js
git commit -m "feat(progress): add day key and gain rules for the daily goal"
```

---

### Task 2: Daily totals and the request day key (→ S2)

Proves the storage side of A3 and review focus 1.

**Files:**
- Create: `server/src/models/DailyProgress.js`
- Create: `server/src/services/progressService.js`
- Test: `server/test/progressService.test.js`

**Interfaces:**
- Produces (`progressService.js`): `dayKeyForRequest(req, now?: Date): string` (reads `X-Timezone`, falls back to `UTC`); `addDailyWords(userId: string, date: string, words: number): Promise<void>` (no-op when `words <= 0`); `getDailyWords(userId: string, date: string): Promise<number>` (0 when no row).
- Consumes: `dayKey` from Task 1.

- [ ] **Step 1: Write the failing test**

```js
// server/test/progressService.test.js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import { addDailyWords, getDailyWords, dayKeyForRequest } from '../src/services/progressService.js';

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});

const fakeReq = (headers = {}) => ({ get: (name) => headers[name] });

test('words accumulate for the same writer and day', async () => {
  await addDailyWords('user_a', '2026-10-14', 30);
  await addDailyWords('user_a', '2026-10-14', 12);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 42);
});

test('days and writers are kept apart', async () => {
  await addDailyWords('user_a', '2026-10-14', 30);
  await addDailyWords('user_a', '2026-10-15', 5);
  await addDailyWords('user_b', '2026-10-14', 7);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 30);
  assert.equal(await getDailyWords('user_a', '2026-10-15'), 5);
  assert.equal(await getDailyWords('user_b', '2026-10-14'), 7);
});

test('zero or negative gains write nothing', async () => {
  await addDailyWords('user_a', '2026-10-14', 0);
  await addDailyWords('user_a', '2026-10-14', -4);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 0);
});

test('no row reads as zero words', async () => {
  assert.equal(await getDailyWords('user_new', '2026-10-14'), 0);
});

test('the request day key uses the X-Timezone header', () => {
  const now = new Date('2026-10-14T18:16:00Z'); // 00:01 on 15 Oct in Kathmandu
  assert.equal(dayKeyForRequest(fakeReq({ 'X-Timezone': 'Asia/Kathmandu' }), now), '2026-10-15');
});

test('a missing or invalid zone falls back to the UTC day (review focus 1)', () => {
  const now = new Date('2026-10-14T18:16:00Z');
  assert.equal(dayKeyForRequest(fakeReq(), now), '2026-10-14');
  assert.equal(dayKeyForRequest(fakeReq({ 'X-Timezone': 'Mars/Olympus' }), now), '2026-10-14');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/progressService.test.js`
Expected: FAIL with "Cannot find module '../src/services/progressService.js'".

- [ ] **Step 3: Write minimal implementation**

`server/src/models/DailyProgress.js`:

```js
import mongoose from 'mongoose';

const dailyProgressSchema = new mongoose.Schema(
  {
    _id: { type: String }, // `${userId}_${YYYY-MM-DD}`
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    words: { type: Number, default: 0 },
    updatedAt: { type: String },
  },
  { versionKey: false }
);

export default mongoose.model('DailyProgress', dailyProgressSchema);
```

`server/src/services/progressService.js`:

```js
import DailyProgress from '../models/DailyProgress.js';
import { dayKey } from './wordCountService.js';

const FALLBACK_ZONE = 'UTC';

// The writer's current day, from the X-Timezone header. A missing or unknown zone uses UTC and never fails a request.
export function dayKeyForRequest(req, now = new Date()) {
  const zone = req.get('X-Timezone') || FALLBACK_ZONE;
  try {
    return dayKey(now, zone);
  } catch (err) {
    if (err instanceof RangeError) return dayKey(now, FALLBACK_ZONE);
    throw err;
  }
}

export async function addDailyWords(userId, date, words) {
  if (!(words > 0)) return;
  await DailyProgress.updateOne(
    { _id: `${userId}_${date}` },
    { $inc: { words }, $set: { userId, date, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function getDailyWords(userId, date) {
  const doc = await DailyProgress.findById(`${userId}_${date}`).lean();
  return doc?.words ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/progressService.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/DailyProgress.js server/src/services/progressService.js server/test/progressService.test.js
git commit -m "feat(progress): store daily word totals per writer"
```

---

### Task 3: Daily goal and progress routes (→ S3; proves A1)

**Files:**
- Modify: `server/src/models/Settings.js`
- Modify: `server/src/services/progressService.js`
- Create: `server/src/routes/progress.js`
- Modify: `server/src/server.js`
- Modify: `server/test/support/http.js`
- Test: `server/test/progress.routes.test.js`

**Interfaces:**
- Produces (HTTP): `GET /api/progress/today` → `200 { date, words, goal }`. `PUT /api/progress/goal` with `{ goal }` → `200 { goal }`, or `400 { error, code: 'INVALID_GOAL' }`.
- Produces (`progressService.js`): `isValidGoal(value: unknown): boolean` (`null`, or an integer 1–100000); `getDailyGoal(userId: string): Promise<number | null>`; `setDailyGoal(userId: string, goal: number | null): Promise<number | null>`.
- Consumes: `dayKeyForRequest`, `getDailyWords` from Task 2; `httpError` from `middleware/errorHandler.js`.

- [ ] **Step 1: Write the failing test**

```js
// server/test/progress.routes.test.js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';

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
});

const setGoal = (goal, user = 'user_a') =>
  request(app).put('/api/progress/goal').set('x-test-user', user).send({ goal });

test('a writer with no settings and no progress reads zero and no goal (review focus 4)', async () => {
  const res = await request(app).get('/api/progress/today').set('x-test-user', 'user_a');
  assert.equal(res.status, 200);
  assert.match(res.body.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual({ words: res.body.words, goal: res.body.goal }, { words: 0, goal: null });
});

test('the goal can be set, changed and cleared (A1)', async () => {
  assert.equal((await setGoal(500)).body.goal, 500);
  let today = await request(app).get('/api/progress/today').set('x-test-user', 'user_a');
  assert.equal(today.body.goal, 500);

  assert.equal((await setGoal(800)).body.goal, 800);
  today = await request(app).get('/api/progress/today').set('x-test-user', 'user_a');
  assert.equal(today.body.goal, 800);

  assert.equal((await setGoal(null)).body.goal, null);
  today = await request(app).get('/api/progress/today').set('x-test-user', 'user_a');
  assert.equal(today.body.goal, null);
});

test('invalid goals are refused and nothing is saved (review focus 3)', async () => {
  for (const bad of [0, -5, 2.5, '500', 100001]) {
    const res = await setGoal(bad);
    assert.equal(res.status, 400, `goal ${JSON.stringify(bad)} should be refused`);
    assert.equal(res.body.code, 'INVALID_GOAL');
  }
  const missing = await request(app).put('/api/progress/goal').set('x-test-user', 'user_a').send({});
  assert.equal(missing.status, 400);
  const today = await request(app).get('/api/progress/today').set('x-test-user', 'user_a');
  assert.equal(today.body.goal, null);
});

test('the goal belongs to one writer', async () => {
  await setGoal(500, 'user_a');
  const other = await request(app).get('/api/progress/today').set('x-test-user', 'user_b');
  assert.equal(other.body.goal, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/progress.routes.test.js`
Expected: FAIL with 404 on `/api/progress/...`, because the router is not mounted in the test app.

- [ ] **Step 3: Write minimal implementation**

In `server/src/models/Settings.js`, add one field after `aiEnabled`:

```js
    // No default: unset means no daily goal (see progressService)
    dailyWordGoal: { type: Number },
```

In `server/src/services/progressService.js`, add the imports and functions:

```js
import Settings from '../models/Settings.js';

const MAX_GOAL = 100000;

export function isValidGoal(value) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= MAX_GOAL);
}

export async function getDailyGoal(userId) {
  const settings = await Settings.findById(userId).lean();
  return settings?.dailyWordGoal ?? null;
}

export async function setDailyGoal(userId, goal) {
  await Settings.updateOne(
    { _id: userId },
    { $set: { dailyWordGoal: goal, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  return goal;
}
```

Create `server/src/routes/progress.js`:

```js
import { Router } from 'express';
import { httpError } from '../middleware/errorHandler.js';
import {
  dayKeyForRequest,
  getDailyWords,
  getDailyGoal,
  setDailyGoal,
  isValidGoal,
} from '../services/progressService.js';

const router = Router();

// GET /api/progress/today
router.get('/today', async (req, res, next) => {
  try {
    const date = dayKeyForRequest(req);
    const [words, goal] = await Promise.all([getDailyWords(req.user.id, date), getDailyGoal(req.user.id)]);
    res.json({ date, words, goal });
  } catch (err) {
    next(err);
  }
});

// PUT /api/progress/goal
router.put('/goal', async (req, res, next) => {
  try {
    const { goal } = req.body || {};
    if (!isValidGoal(goal)) {
      return next(httpError(400, 'INVALID_GOAL', 'Daily goal must be a whole number from 1 to 100000, or empty to clear it'));
    }
    res.json({ goal: await setDailyGoal(req.user.id, goal) });
  } catch (err) {
    next(err);
  }
});

export default router;
```

In `server/src/server.js`, add the import next to the other routers and mount it beside the others:

```js
import progressRouter from './routes/progress.js';
// ...
app.use('/api/progress', auth, progressRouter);
```

In `server/test/support/http.js`, import and mount it in `buildApp` (before the errorHandler):

```js
import progressRouter from '../../src/routes/progress.js';
// ...
  app.use('/api/progress', progressRouter);
```

Before writing this, confirm `errorHandler` returns `{ error, code }` for `httpError`. The client's `apiError` reads `err.error` and `err.code`, so it should. If the shape differs, adjust the test's `res.body.code` assertion to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/progress.routes.test.js`
Expected: PASS, 4 tests.

Also confirm that saving other settings keeps the goal: read `server/src/services/settingsService.js` `saveSettings` and check that it merges with `$set` and does not replace the whole document. If it replaces, change it to merge, and add a test that saves an AI setting after a goal is set and reads the goal back.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Settings.js server/src/services/progressService.js server/src/routes/progress.js server/src/server.js server/test/support/http.js server/test/progress.routes.test.js
git commit -m "feat(progress): add daily goal and today's progress routes"
```

---

### Task 4: Count gains on chapter save (→ S2, S5; proves A3, A4, A5)

**Files:**
- Modify: `server/src/routes/chapters.js` (the `PUT /:chapterId` handler, around lines 116–165)
- Test: `server/test/chapterDailyProgress.test.js`

**Interfaces:**
- Consumes: `gainFor` (Task 1); `dayKeyForRequest`, `addDailyWords`, `getDailyWords` (Task 2).
- Produces: no change to the PUT response body.

- [ ] **Step 1: Write the failing test**

```js
// server/test/chapterDailyProgress.test.js
import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import { getDailyWords } from '../src/services/progressService.js';

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
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', number: 1, title: 'One', content: '', wordCount: 0 });
});

const save = (content, headers = { 'X-Timezone': 'UTC' }) => {
  const req = request(app).put('/api/works/work_a/chapters/ch_1').set('x-test-user', 'user_a');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send({ content });
};
const todayUtc = () => new Date().toISOString().slice(0, 10);

test('a save adds the gain to today\'s count (A5)', async () => {
  assert.equal((await save('one two three')).status, 200);
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('deleting text adds nothing (A4)', async () => {
  await save('one two three');
  await save('one');
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('two saves add up', async () => {
  await save('one two');
  await save('one two three four');
  assert.equal(await getDailyWords('user_a', todayUtc()), 4);
});

test('a move within one save adds nothing (A4)', async () => {
  await save('alpha beta gamma');
  await save('gamma beta alpha');
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('two tabs saving the same chapter at once do not double count (review focus 2)', async () => {
  await Promise.all([save('one two'), save('one two three four five')]);
  const chapter = await Chapter.findById('ch_1').lean();
  assert.equal(await getDailyWords('user_a', todayUtc()), chapter.wordCount);
});

test('a missing or invalid X-Timezone still saves and counts under UTC (review focus 1)', async () => {
  assert.equal((await save('one two', {})).status, 200);
  assert.equal((await save('one two three', { 'X-Timezone': 'Mars/Olympus' })).status, 200);
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('a save at 23:59 and 00:01 in Kathmandu lands on different days (A3, review focus 5)', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T18:14:00Z') }); // 23:59 on 14 Oct
  try {
    await save('one two', { 'X-Timezone': 'Asia/Kathmandu' });
    mock.timers.setTime(new Date('2026-10-14T18:16:00Z').getTime()); // 00:01 on 15 Oct
    await save('one two three', { 'X-Timezone': 'Asia/Kathmandu' });
  } finally {
    mock.timers.reset();
  }
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 2);
  assert.equal(await getDailyWords('user_a', '2026-10-15'), 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/chapterDailyProgress.test.js`
Expected: FAIL, because the save doesn't write any daily words yet (the first test gets 0, not 3).

Note: `mock.timers` needs Node 20.4 or later. Check with `node -v` first. If the runtime is older, drop the Kathmandu test to a unit test of `dayKeyForRequest` (already in Task 2) and say so in the summary.

- [ ] **Step 3: Write minimal implementation**

In `server/src/routes/chapters.js`, add the imports:

```js
import { gainFor } from '../services/wordCountService.js';
import { addDailyWords, dayKeyForRequest } from '../services/progressService.js';
```

(`countWords` and `recalculate` are already imported from `wordCountService.js`. Merge `gainFor` into that import.)

In `PUT /:chapterId`, replace the write and response with a pre-update read in the same write:

```js
    // new: false returns the pre-update document, so the gain is measured in the same atomic write
    const before = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, { $set: setFields }, { new: false });
    const updated = await Chapter.findById(chapterId);
```

Keep the existing snapshot block (it uses `chapter`, the findOne result from above). After `await recalculate(workId);` and before `res.json(updated)`, add:

```js
    try {
      await addDailyWords(req.user.id, dayKeyForRequest(req), gainFor(before?.wordCount ?? 0, words));
    } catch (progressErr) {
      console.error('Daily progress error:', progressErr);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/chapterDailyProgress.test.js`
Expected: PASS, 6 tests. Then run the existing chapter tests to check nothing else moved: `cd server && node --test test/chapterThreadIds.test.js test/sceneMove.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chapters.js server/test/chapterDailyProgress.test.js
git commit -m "feat(progress): count word gains on chapter save"
```

---

### Task 5: Client helpers, timezone header and hook (→ S4; proves A2)

**Files:**
- Create: `client/src/utils/dailyProgress.js`
- Modify: `client/src/utils/api.js` (in `apiFetch`, add the header)
- Create: `client/src/hooks/useDailyProgress.js`
- Test: `client/test/dailyProgress.test.js`

**Interfaces:**
- Produces (`utils/dailyProgress.js`): `browserTimeZone(): string`; `pendingGain(currentWords: number, savedWords: number): number`; `progressView({ words, goal, pendingGain }): { total, goal, percent, text } | null` (null when `words` is null); `parseGoalInput(text: string): { ok: true, goal: number | null } | { ok: false, message: string }`.
- Produces (hook): `useDailyProgress(chapterWords: number, saveStatus: string, chapterId: string): { words: number | null, goal: number | null, pendingGain: number }`.
- Consumes: `api.get('/progress/today')` from `utils/api.js`; `useEditor()` and `useWordCount` in the component (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// client/test/dailyProgress.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserTimeZone, pendingGain, progressView, parseGoalInput } from '../src/utils/dailyProgress.js';

test('the browser timezone is a non-empty IANA name', () => {
  assert.equal(typeof browserTimeZone(), 'string');
  assert.ok(browserTimeZone().length > 0);
});

test('pending gain is the unsaved increase, never negative (A2)', () => {
  assert.equal(pendingGain(10, 7), 3);
  assert.equal(pendingGain(7, 10), 0);
});

test('the view adds the pending gain to the saved total as the writer types (A2)', () => {
  assert.deepEqual(progressView({ words: 1000, goal: 1000, pendingGain: 240 }), {
    total: 1240,
    goal: 1000,
    percent: 100,
    text: 'Today 1,240 / 1,000 words',
  });
});

test('with no goal the view shows today\'s count only', () => {
  assert.deepEqual(progressView({ words: 200, goal: null, pendingGain: 0 }), {
    total: 200,
    goal: null,
    percent: null,
    text: 'Today 200 words',
  });
});

test('a failed fetch hides the daily part', () => {
  assert.equal(progressView({ words: null, goal: null, pendingGain: 5 }), null);
});

test('goal input: blank clears, whole numbers pass, everything else is refused (A1)', () => {
  assert.deepEqual(parseGoalInput(''), { ok: true, goal: null });
  assert.deepEqual(parseGoalInput(' 500 '), { ok: true, goal: 500 });
  for (const bad of ['0', '2.5', 'abc', '100001', '-3']) {
    assert.equal(parseGoalInput(bad).ok, false, `${bad} should be refused`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && node --import ./test/support/register.js --test test/dailyProgress.test.js`
Expected: FAIL with "Cannot find module '../src/utils/dailyProgress.js'".

- [ ] **Step 3: Write minimal implementation**

`client/src/utils/dailyProgress.js`:

```js
const MAX_GOAL = 100000;

// The browser's IANA timezone, sent as X-Timezone so the server keys days by the writer's local midnight
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Words typed in this chapter since its last successful save
export function pendingGain(currentWords, savedWords) {
  return Math.max(0, currentWords - savedWords);
}

export function progressView({ words, goal, pendingGain }) {
  if (words === null) return null;
  const total = words + pendingGain;
  const fmt = (n) => n.toLocaleString('en-US');
  if (goal === null) {
    return { total, goal: null, percent: null, text: `Today ${fmt(total)} words` };
  }
  return {
    total,
    goal,
    percent: Math.min(100, Math.round((total / goal) * 100)),
    text: `Today ${fmt(total)} / ${fmt(goal)} words`,
  };
}

const REFUSED = 'Enter a whole number from 1 to 100000, or leave it empty to clear the goal.';

export function parseGoalInput(text) {
  const trimmed = String(text).trim();
  if (trimmed === '') return { ok: true, goal: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: REFUSED };
  const goal = Number(trimmed);
  if (goal < 1 || goal > MAX_GOAL) return { ok: false, message: REFUSED };
  return { ok: true, goal };
}
```

In `client/src/utils/api.js`, add the header inside `apiFetch`'s `headers`, importing `browserTimeZone` at the top:

```js
import { browserTimeZone } from './dailyProgress.js';
// ...
    headers: { 'Content-Type': 'application/json', 'X-Timezone': browserTimeZone() },
```

`client/src/hooks/useDailyProgress.js`:

```js
import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';
import { pendingGain } from '../utils/dailyProgress.js';

// Set to the exact status string useAutosave writes after a successful save (check useAutosave.js)
const SAVED_STATUS = 'saved';

export function useDailyProgress(chapterWords, saveStatus, chapterId) {
  const [server, setServer] = useState({ words: null, goal: null });
  const savedWordsRef = useRef(chapterWords);

  // Reload today's total when the chapter changes or a save completes
  useEffect(() => {
    let cancelled = false;
    api
      .get('/progress/today')
      .then((data) => {
        if (!cancelled) setServer({ words: data.words, goal: data.goal });
      })
      .catch(() => {
        if (!cancelled) setServer({ words: null, goal: null });
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, saveStatus]);

  // The count at the last successful save becomes the baseline for the unsaved gain
  useEffect(() => {
    savedWordsRef.current = chapterWords;
  }, [chapterId]);

  useEffect(() => {
    if (saveStatus === SAVED_STATUS) savedWordsRef.current = chapterWords;
  }, [saveStatus]);

  return { ...server, pendingGain: pendingGain(chapterWords, savedWordsRef.current) };
}
```

`SAVED_STATUS` is the status string `useAutosave` sets after a successful save. Read `client/src/hooks/useAutosave.js` and `client/src/context/EditorContext.jsx` for the exact value, and define `const SAVED_STATUS = '<that value>';` at the top of the hook. Do not guess it.

`countWords` is imported but unused in this sketch. Remove it unless you need it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && node --import ./test/support/register.js --test test/dailyProgress.test.js`
Expected: PASS, 6 tests. Then run the full client suite: `cd client && npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/dailyProgress.js client/src/utils/api.js client/src/hooks/useDailyProgress.js client/test/dailyProgress.test.js
git commit -m "feat(progress): add daily progress helpers and hook"
```

---

### Task 6: Show today's progress in the word counter (→ S4; proves A2)

**Files:**
- Modify: `client/src/components/editor/WordCounter.jsx`
- Modify: `client/src/index.css` (styles for `.word-counter-daily` and a thin `.word-counter-bar` in the gold accent `#c9a96e`)

**Interfaces:**
- Consumes: `useDailyProgress` (Task 5), `progressView` (Task 5), `useEditor` and `useWordCount` (existing).
- Produces: none.

- [ ] **Step 1: Write the failing test**

The pure logic is covered by Task 5. Before editing the component, check whether the repo has a component render test: `grep -rl "render\|createRoot" client/test`. If it does, write a test that renders `WordCounter` with a goal and checks the text "Today … / … words". If it doesn't, the component stays thin (it only wires the hook to `progressView`), and the check moves to Task 8's manual run.

- [ ] **Step 2: Run test to verify it fails**

Run the render test, or skip this step if the repo has no render pattern, and say so in the commit message.

- [ ] **Step 3: Write minimal implementation**

In `WordCounter.jsx`, add the hook and the view below the existing chapter count:

```jsx
import { useDailyProgress } from '../../hooks/useDailyProgress.js';
import { progressView } from '../../utils/dailyProgress.js';
// inside the component, after chapterWords (confirm where saveStatus lives; it may be on the editor state or its own context):
  const daily = progressView(
    useDailyProgress(chapterWords, editorState.saveStatus, editorState.chapterId)
  );
// in the JSX, after the existing spans:
      {daily && (
        <span className="word-counter-daily">
          {daily.text}
          {daily.percent !== null && (
            <span className="word-counter-bar" aria-hidden="true">
              <span style={{ width: `${daily.percent}%` }} />
            </span>
          )}
        </span>
      )}
```

Confirm where `saveStatus` lives (the editor state or its own context), then fix the two lines above to match. Remove the stray `saveState` line if it isn't needed.

Add the styles to `client/src/index.css`, using the existing tokens (`#c9a96e` gold, muted text color) and a dark-theme-safe track color.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test`. Expected: PASS. Then run the build: `cd client && npx vite build`. Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/editor/WordCounter.jsx client/src/index.css
git commit -m "feat(progress): show today's progress in the word counter"
```

---

### Task 7: Daily goal field on the settings page (→ S3; proves A1 in the UI)

**Files:**
- Modify: `client/src/pages/Settings.jsx` (confirm the path first with `ls client/src/pages`)

**Interfaces:**
- Consumes: `api.get('/progress/today')` (for the current goal), `api.put('/progress/goal', { goal })`, `parseGoalInput` (Task 5).
- Produces: none.

- [ ] **Step 1: Write the failing test**

`parseGoalInput` is already tested in Task 5, which covers the field's input rules. Before adding the UI, check the existing client tests for a render pattern, as in Task 6. If none, the UI check moves to Task 8.

- [ ] **Step 2: Run test to verify it fails**

Run the render test if the pattern exists. Otherwise skip, and note it in the summary.

- [ ] **Step 3: Write minimal implementation**

In `Settings.jsx`, add a "Daily word goal" section beside the existing settings sections:

- Load the current goal from `api.get('/progress/today')` → `goal`.
- A number input, pre-filled with the goal (empty when `null`).
- A Save button. It calls `parseGoalInput(value)`. If `ok` is false, show `message` and send nothing. If `ok`, call `api.put('/progress/goal', { goal })`.
- A Clear button that calls `api.put('/progress/goal', { goal: null })`.
- Show any server error from the `api` wrapper's `message`.

Use the page's existing section and form styles. Do not add new CSS unless a class is missing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test`. Expected: PASS. Then `cd client && npx vite build`. Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Settings.jsx
git commit -m "feat(progress): set and clear the daily word goal in settings"
```

---

### Task 8: Verify the whole change

No subtask is linked to this task; it is verification only.

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run the server suite**

Run: `cd server && npm test`
Expected: all tests pass, including the in-memory Mongo HTTP tests. If the in-memory binary download is blocked, say so; don't call it passing.

- [ ] **Step 2: Run the client suite and build**

Run: `cd client && npm test && npx vite build`
Expected: tests pass and the build succeeds.

- [ ] **Step 3: Check the running app**

Start the dev stack, or the server with `NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake` if AI is not needed. Open a chapter, type words, and confirm: the counter's "Today" total rises after an autosave; the goal set on Settings appears; clearing it hides the bar. Note what was checked and what wasn't.

- [ ] **Step 4: Commit any fixes**

If a check fails, fix it with a test first (TDD), then commit with a `fix(progress): …` message.

---

## Coverage check

| Subtask | Delivered by |
|---|---|
| S1 Decide Q-2 | Recorded in the approved spec (per writer). No code task; confirm closed on the card. |
| S2 Daily count rule | Tasks 1, 2, 4 |
| S3 Goal setting | Tasks 3, 7 |
| S4 Live progress UI | Tasks 5, 6 |
| S5 Tests | Tests in Tasks 1–5 and 7; full run in Task 8 |

| Acceptance | Proof |
|---|---|
| A1 Sets, changes or clears a goal | Task 3 (set, change, clear, invalid, per-writer HTTP tests); Task 5 (goal input rules); Task 7 (UI) |
| A2 Progress visible and updates as they type | Task 5 (`progressView` adds pending gain; `pendingGain` tests); Task 6 (render or manual check in Task 8) |
| A3 Resets at midnight in the writer's timezone | Task 1 (`dayKey` in two zones); Task 4 (23:59 and 00:01 Kathmandu through the HTTP save, with a mocked clock); Task 2 (`X-Timezone` and fallback) |
| A4 Deleting or moving text is not negative | Task 1 (`gainFor`); Task 4 (delete and move through the save path) |
| A5 Tests cover the daily count and the day boundary | Tasks 1, 2, 4 (count and boundary); Task 8 (full suite) |
