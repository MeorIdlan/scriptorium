# Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the capped in-chapter draft history with a `Snapshot` collection (automatic, named and milestone snapshots, thinned over time), whole-work milestones, and a compare view for chapters and milestones.

**Architecture:** Snapshots and milestones get their own Mongoose models and routers, sharing a small `snapshotService` for taking, thinning and restoring snapshots. Pure helpers (`snapshotRetention`, `snapshotNames`, `snapshotData`, `textDiff`, `milestoneCompare`) hold the logic and are unit-tested; routes are verified against a throwaway Mongo with API scripts. The client diffs plain text with the existing `polishDiff.js` through a new `historyDiff.js`, rendered by a shared `VersionDiff` component in two portal modals.

**Tech Stack:** Express 4 + Mongoose 8 (ESM), React 18 + Vite 5, Node's built-in test runner (`node --test`), Docker/Podman for the throwaway Mongo.

**Spec:** `docs/superpowers/specs/2026-10-11-version-history-design.md`

## Global Constraints

- Branch: `feat/version-history`. Do not push.
- Every `Snapshot`/`Milestone` query filters by `workId`; every new route sits behind `loadWork`.
- Ids: snapshots `snap_<Date.now()>_<8 hex>`, migrated snapshots `snap_<chapterId>_<Date.parse(savedAt)>`, milestones `ms_<Date.now()>_<8 hex>`.
- Automatic snapshot interval: 10 minutes (`SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000`). No 50-entry cap.
- Retention: all `auto` under 24 h; newest per UTC calendar day (`floor(t / 86400000)`) from 24 h to 30 days; newest per calendar week (`floor(t / 604800000)`) after. `named` and `milestone` never thinned.
- Names: trimmed; empty → `400 MISSING_FIELD`; over 80 characters → `400 TOO_LONG`.
- Not allowed operations → `400 NOT_ALLOWED`; missing or other-work ids → `404 NOT_FOUND`.
- Restore always saves the current text first as `auto` with note `Before restore`.
- Diff size guard: 4,000,000 cells (`MAX_DIFF_CELLS`).
- Copy: "No text changes (formatting changes aren't shown).", "Showing paragraph-level changes", "Your current text will be saved as a snapshot first.", default milestone name `Milestone — 11 Oct 2026` (en-GB, today).
- Modals render through `createPortal(…, document.body)`.
- Tests: `npm --prefix server test`, `npm --prefix client test` (currently 41 and 33 passing).

## Review Focus

1. Unsaved typing at the moment the writer restores, saves a named snapshot, or creates a milestone → it must be saved first so it lands in "Before restore" / the snapshot / the milestone (Task 6 `flushOpenChapter` tests; Task 7/8 browser checks).
2. A pending autosave firing after a restore of the open chapter → must store the restored text, not the old text (Task 7 browser check waits past the 5 s autosave and re-reads the chapter).
3. Very large chapters in the milestone table or compare view → bounded work, no hang (Task 2 `diffStats` guard test; Task 6 fallback and word-guard tests).
4. Versions differing only in whitespace or formatting → "No text changes", not a wall of identical red/green (Task 6 test).
5. Legacy `draftHistory` with duplicate or unparseable `savedAt` → migration still completes (Task 3 mapper tests).

## File map

| File | Responsibility |
|---|---|
| `server/src/services/snapshotRetention.js` (new) | `thinSnapshots` — pure retention rule |
| `server/src/services/snapshotNames.js` (new) | `validateName` |
| `server/src/services/snapshotData.js` (new) | `newSnapshotId`, `newMilestoneId`, `snapshotFields`, `snapshotsFromDraftHistory` — pure |
| `server/src/services/textDiff.js` (new) | `diffStats` — words added/removed |
| `server/src/services/milestoneCompare.js` (new) | `milestoneRows` — pure comparison rows |
| `server/src/models/Snapshot.js`, `Milestone.js` (new) | Mongoose models |
| `server/src/services/snapshotService.js` (new) | `autoSnapshotDue`, `takeAutoSnapshot`, `restoreFromSnapshot` |
| `server/src/services/snapshotMigration.js` (new) | `migrateDraftHistory` (startup) |
| `server/src/routes/snapshots.js`, `milestones.js` (new) | API |
| `server/src/routes/chapters.js`, `models/Chapter.js`, `services/workService.js`, `server.js`, `routes/ai.js`, `services/exportService.js` | wiring and cleanup |
| `client/src/utils/polishDiff.js` | `paragraphSpans`, optional splitter for `diffSentences` |
| `client/src/utils/historyDiff.js` (new) | `buildHistoryDiff`, `collapseUnchanged` |
| `client/src/utils/versionHistory.js` (new) | labels, grouping, ordering, `flushOpenChapter` |
| `client/src/utils/api.js` | `api.patch` |
| `client/src/components/overlays/VersionDiff.jsx`, `ChapterHistoryModal.jsx`, `MilestonesModal.jsx` (new) | UI |
| `client/src/components/overlays/DraftHistoryModal.jsx` | deleted |
| `client/src/components/editor/Toolbar.jsx`, `client/src/pages/MainRoom.jsx`, `client/src/index.css` | wiring and styles |

Scratch path used below: `SCRATCH=/tmp/claude-1000/-home-meor-workspace-scriptorium/bb6b7696-65a0-4dee-a97a-d8800928bc9a/scratchpad`.

---

### Task 1: Retention rule and name validation

**Files:**
- Create: `server/src/services/snapshotRetention.js`, `server/src/services/snapshotNames.js`
- Test: `server/test/snapshotRetention.test.js`, `server/test/snapshotNames.test.js`

**Interfaces:**
- Produces: `thinSnapshots(snapshots: {id, kind, createdAt}[], now: string|number|Date): string[]` (ids to delete); `validateName(name: unknown): string` (throws `httpError` 400); `MAX_NAME_LENGTH = 80`.

- [ ] **Step 1: Write the failing tests**

`server/test/snapshotRetention.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinSnapshots } from '../src/services/snapshotRetention.js';

const NOW = '2026-10-11T12:00:00.000Z';
const auto = (id, createdAt) => ({ id, kind: 'auto', createdAt });

test('keeps every automatic snapshot from the last 24 hours', () => {
  const snaps = [
    auto('a', '2026-10-11T11:00:00.000Z'),
    auto('b', '2026-10-11T10:00:00.000Z'),
    auto('c', '2026-10-10T13:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
});

test('keeps the newest per calendar day between 24 hours and 30 days', () => {
  const snaps = [
    auto('d5-early', '2026-10-05T08:00:00.000Z'),
    auto('d5-late', '2026-10-05T20:00:00.000Z'),
    auto('d5-mid', '2026-10-05T12:00:00.000Z'),
    auto('d6', '2026-10-06T08:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW).sort(), ['d5-early', 'd5-mid']);
});

test('keeps the newest per calendar week after 30 days', () => {
  // Epoch weeks start on Thursday; 2026-08-06 is a Thursday
  const snaps = [
    auto('aug7', '2026-08-07T09:00:00.000Z'),
    auto('aug10', '2026-08-10T09:00:00.000Z'),
    auto('aug13', '2026-08-13T09:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), ['aug7']);
});

test('never returns named or milestone snapshots', () => {
  const snaps = [
    { id: 'n1', kind: 'named', createdAt: '2026-10-05T08:00:00.000Z' },
    { id: 'n2', kind: 'named', createdAt: '2026-10-05T09:00:00.000Z' },
    { id: 'm1', kind: 'milestone', createdAt: '2026-08-07T09:00:00.000Z' },
    { id: 'm2', kind: 'milestone', createdAt: '2026-08-08T09:00:00.000Z' },
    auto('a1', '2026-10-05T10:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
});

test('a snapshot kept today is still kept a day later', () => {
  const snaps = [auto('d5', '2026-10-05T20:00:00.000Z'), auto('d6', '2026-10-06T08:00:00.000Z')];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
  assert.deepEqual(thinSnapshots(snaps, '2026-10-12T12:00:00.000Z'), []);
});

test('an older entry goes once a newer one in its day passes 24 hours', () => {
  const snaps = [auto('late', '2026-10-10T20:00:00.000Z'), auto('early', '2026-10-10T08:00:00.000Z')];
  // 'late' is under 24 h old, so 'early' is the only one in the day tier
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
  assert.deepEqual(thinSnapshots(snaps, '2026-10-11T21:00:00.000Z'), ['early']);
});

test('handles empty input and unparseable dates', () => {
  assert.deepEqual(thinSnapshots([], NOW), []);
  assert.deepEqual(thinSnapshots([auto('x', 'not a date')], NOW), []);
});
```

`server/test/snapshotNames.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateName, MAX_NAME_LENGTH } from '../src/services/snapshotNames.js';

test('validateName trims and returns the name', () => {
  assert.equal(validateName('  Draft 1  '), 'Draft 1');
});

test('validateName rejects missing or blank names', () => {
  for (const bad of [undefined, null, '', '   ', 42]) {
    assert.throws(() => validateName(bad), (err) => err.status === 400 && err.code === 'MISSING_FIELD');
  }
});

test('validateName allows 80 characters and rejects 81', () => {
  assert.equal(MAX_NAME_LENGTH, 80);
  assert.equal(validateName('x'.repeat(80)).length, 80);
  assert.throws(() => validateName('x'.repeat(81)), (err) => err.status === 400 && err.code === 'TOO_LONG');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test`
Expected: FAIL — `Cannot find module '.../snapshotRetention.js'` and `.../snapshotNames.js`; the 41 existing tests pass.

- [ ] **Step 3: Implement**

`server/src/services/snapshotRetention.js`:

```js
// Which automatic snapshots to drop. Pure; named and milestone snapshots are
// never touched. Buckets are fixed calendar days/weeks (UTC), so a snapshot
// that survives isn't swapped out later just because time moved on.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DAILY_UNTIL_MS = 30 * DAY_MS;

export function thinSnapshots(snapshots, now) {
  const nowMs = new Date(now).getTime();
  const autos = snapshots
    .filter((s) => s.kind === 'auto')
    .map((s) => ({ id: s.id, t: Date.parse(s.createdAt) }))
    .filter((s) => !Number.isNaN(s.t))
    .sort((a, b) => b.t - a.t);

  const kept = new Set();
  const doomed = [];
  for (const s of autos) {
    const age = nowMs - s.t;
    if (age < DAY_MS) continue;
    const bucket = age < DAILY_UNTIL_MS ? `d${Math.floor(s.t / DAY_MS)}` : `w${Math.floor(s.t / WEEK_MS)}`;
    if (kept.has(bucket)) doomed.push(s.id);
    else kept.add(bucket);
  }
  return doomed;
}
```

`server/src/services/snapshotNames.js`:

```js
import { httpError } from '../middleware/errorHandler.js';

export const MAX_NAME_LENGTH = 80;

// Names for named snapshots and milestones
export function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw httpError(400, 'MISSING_FIELD', 'name is required');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw httpError(400, 'TOO_LONG', `name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return trimmed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test`
Expected: PASS — 51 tests (41 + 7 + 3).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/snapshotRetention.js server/src/services/snapshotNames.js server/test/snapshotRetention.test.js server/test/snapshotNames.test.js
git commit -m "feat: snapshot retention rule and name validation"
```

---

### Task 2: Word statistics and milestone comparison rows

**Files:**
- Create: `server/src/services/textDiff.js`, `server/src/services/milestoneCompare.js`
- Test: `server/test/textDiff.test.js`, `server/test/milestoneCompare.test.js`

**Interfaces:**
- Produces: `diffStats(before: string, after: string, opts?: { maxCells?: number }): { added: number, removed: number }`; `MAX_DIFF_CELLS = 4_000_000`; `milestoneRows(milestoneChapters: {chapterId, title, order, snapshotId, wordCount}[], snapshotTexts: Map<string, string>, currentChapters: {_id, title, content, wordCount}[]): Row[]` with `Row = { chapterId, title, state: 'changed'|'unchanged'|'deleted'|'new', snapshotId, wordsThen, wordsNow, added, removed }`.

- [ ] **Step 1: Write the failing tests**

`server/test/textDiff.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffStats } from '../src/services/textDiff.js';

test('identical texts have no changes', () => {
  assert.deepEqual(diffStats('One two.\nThree.', 'One two.\nThree.'), { added: 0, removed: 0 });
});

test('a one-word edit counts as one word each way', () => {
  assert.deepEqual(diffStats('The cat sat.\nIt rained.', 'The dog sat.\nIt rained.'), { added: 1, removed: 1 });
});

test('an added paragraph counts its words as added', () => {
  assert.deepEqual(diffStats('First line.', 'First line.\nA brand new one.'), { added: 4, removed: 0 });
});

test('a removed paragraph counts its words as removed', () => {
  assert.deepEqual(diffStats('Keep this.\nDrop these three.\nEnd.', 'Keep this.\nEnd.'), { added: 0, removed: 3 });
});

test('empty on either side', () => {
  assert.deepEqual(diffStats('', 'Two words.'), { added: 2, removed: 0 });
  assert.deepEqual(diffStats('Two words.', ''), { added: 0, removed: 2 });
  assert.deepEqual(diffStats('', ''), { added: 0, removed: 0 });
});

test('repeated paragraphs align', () => {
  assert.deepEqual(diffStats('Same.\nSame.\nSame.', 'Same.\nSame.'), { added: 0, removed: 1 });
});

test('a change too large to compare word by word counts every word in it', () => {
  const before = 'alpha beta gamma\nend';
  const after = 'alpha beta delta\nend';
  assert.deepEqual(diffStats(before, after), { added: 1, removed: 1 });
  assert.deepEqual(diffStats(before, after, { maxCells: 4 }), { added: 3, removed: 3 });
});
```

`server/test/milestoneCompare.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milestoneRows } from '../src/services/milestoneCompare.js';

const milestone = [
  { chapterId: 'c1', title: 'One (old title)', order: 0, snapshotId: 's1', wordCount: 3 },
  { chapterId: 'c2', title: 'Two', order: 1, snapshotId: 's2', wordCount: 2 },
  { chapterId: 'c4', title: 'Four', order: 2, snapshotId: 's4', wordCount: 1 },
];
const texts = new Map([
  ['s1', 'A b c.'],
  ['s2', 'Gone now.'],
  ['s4', 'Same.'],
]);
const current = [
  { _id: 'c1', title: 'One', content: 'A b d.', wordCount: 3 },
  { _id: 'c4', title: 'Four', content: 'Same.', wordCount: 1 },
  { _id: 'c3', title: 'Three', content: 'Brand new.', wordCount: 2 },
];

test('milestoneRows lists today’s chapters in order, then deleted ones', () => {
  const rows = milestoneRows(milestone, texts, current);
  assert.deepEqual(rows.map((r) => [r.chapterId, r.state]), [
    ['c1', 'changed'],
    ['c4', 'unchanged'],
    ['c3', 'new'],
    ['c2', 'deleted'],
  ]);
});

test('milestoneRows fills titles, words and changes per state', () => {
  const [changed, unchanged, added, deleted] = milestoneRows(milestone, texts, current);
  assert.deepEqual(changed, {
    chapterId: 'c1', title: 'One', state: 'changed', snapshotId: 's1',
    wordsThen: 3, wordsNow: 3, added: 1, removed: 1,
  });
  assert.deepEqual(unchanged, {
    chapterId: 'c4', title: 'Four', state: 'unchanged', snapshotId: 's4',
    wordsThen: 1, wordsNow: 1, added: 0, removed: 0,
  });
  assert.deepEqual(added, {
    chapterId: 'c3', title: 'Three', state: 'new', snapshotId: null,
    wordsThen: 0, wordsNow: 2, added: 2, removed: 0,
  });
  assert.deepEqual(deleted, {
    chapterId: 'c2', title: 'Two', state: 'deleted', snapshotId: 's2',
    wordsThen: 2, wordsNow: 0, added: 0, removed: 2,
  });
});

test('milestoneRows on an empty milestone and empty work', () => {
  assert.deepEqual(milestoneRows([], new Map(), []), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test`
Expected: FAIL — cannot find `textDiff.js` / `milestoneCompare.js`; the other 51 pass.

- [ ] **Step 3: Implement**

`server/src/services/textDiff.js`:

```js
// Words added/removed between two plain texts. Pure. Matches paragraphs
// first (cheap), then compares words only inside the paragraphs that changed,
// so a one-word edit counts as one word, not a whole paragraph.

export const MAX_DIFF_CELLS = 4_000_000;

const words = (text) => text.split(/\s+/).filter(Boolean);

function lcsLength(a, b) {
  let prev = new Int32Array(b.length + 1);
  let row = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

function wordStats(before, after, maxCells) {
  const a = words(before);
  const b = words(after);
  if (a.length * b.length > maxCells) return { added: b.length, removed: a.length };
  const common = lcsLength(a, b);
  return { added: b.length - common, removed: a.length - common };
}

export function diffStats(before, after, { maxCells = MAX_DIFF_CELLS } = {}) {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const am = a.slice(prefix, a.length - suffix);
  const bm = b.slice(prefix, b.length - suffix);

  // Too many paragraphs to align: compare the whole changed stretch as one run
  if (am.length * bm.length > maxCells) return wordStats(am.join('\n'), bm.join('\n'), maxCells);

  const dp = Array.from({ length: am.length + 1 }, () => new Int32Array(bm.length + 1));
  for (let i = am.length - 1; i >= 0; i--) {
    for (let j = bm.length - 1; j >= 0; j--) {
      dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let added = 0;
  let removed = 0;
  let runA = [];
  let runB = [];
  const flush = () => {
    if (!runA.length && !runB.length) return;
    const stats = wordStats(runA.join('\n'), runB.join('\n'), maxCells);
    added += stats.added;
    removed += stats.removed;
    runA = [];
    runB = [];
  };
  let i = 0;
  let j = 0;
  while (i < am.length || j < bm.length) {
    if (i < am.length && j < bm.length && am[i] === bm[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (j < bm.length && (i >= am.length || dp[i][j + 1] >= dp[i + 1][j])) {
      runB.push(bm[j]);
      j += 1;
    } else {
      runA.push(am[i]);
      i += 1;
    }
  }
  flush();
  return { added, removed };
}
```

`server/src/services/milestoneCompare.js`:

```js
import { diffStats } from './textDiff.js';

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
    const same = thenText === nowText;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test`
Expected: PASS — 61 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/textDiff.js server/src/services/milestoneCompare.js server/test/textDiff.test.js server/test/milestoneCompare.test.js
git commit -m "feat: word-level change counts and milestone comparison rows"
```

---

### Task 3: Snapshot storage, automatic snapshots and migration

**Files:**
- Create: `server/src/services/snapshotData.js`, `server/src/models/Snapshot.js`, `server/src/models/Milestone.js`, `server/src/services/snapshotService.js`, `server/src/services/snapshotMigration.js`
- Modify: `server/src/routes/chapters.js` (snapshot helpers at top, POST create, PUT, old restore route, DELETE), `server/src/models/Chapter.js`, `server/src/services/workService.js`, `server/src/server.js` (`start()`), `server/src/routes/ai.js:182`, `server/src/services/exportService.js:22`
- Test: `server/test/snapshotData.test.js`; E2E `$SCRATCH/vh-e2e-storage.mjs`

**Interfaces:**
- Consumes: `thinSnapshots` (Task 1).
- Produces:
  - `snapshotData.js`: `newSnapshotId(): string`, `newMilestoneId(): string`, `snapshotFields(chapter): { workId, chapterId, chapterTitle, content, contentHtml, wordCount }` (uses `chapter._id`), `snapshotsFromDraftHistory(chapter): object[]` (raw docs with `_id`).
  - Models `Snapshot` (collection `snapshots`), `Milestone` (collection `milestones`).
  - `snapshotService.js`: `SNAPSHOT_INTERVAL_MS`, `autoSnapshotDue(chapterId, now): Promise<boolean>`, `takeAutoSnapshot(chapter, now, { note }?): Promise<void>` (creates then thins; thinning errors logged), `restoreFromSnapshot(chapter, snapshot): Promise<ChapterDoc>`.
  - `snapshotMigration.js`: `migrateDraftHistory(): Promise<void>`.

- [ ] **Step 1: Write the failing unit test**

`server/test/snapshotData.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSnapshotId, newMilestoneId, snapshotFields, snapshotsFromDraftHistory } from '../src/services/snapshotData.js';

test('ids have their prefix and are unique', () => {
  assert.match(newSnapshotId(), /^snap_\d+_[0-9a-f]{8}$/);
  assert.match(newMilestoneId(), /^ms_\d+_[0-9a-f]{8}$/);
  const ids = new Set(Array.from({ length: 200 }, newSnapshotId));
  assert.equal(ids.size, 200);
});

test('snapshotFields copies the chapter text', () => {
  const chapter = { _id: 'ch_1', workId: 'w_1', title: 'One', content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2 };
  assert.deepEqual(snapshotFields(chapter), {
    workId: 'w_1', chapterId: 'ch_1', chapterTitle: 'One',
    content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2,
  });
  assert.deepEqual(snapshotFields({ _id: 'c', workId: 'w', title: 'T' }), {
    workId: 'w', chapterId: 'c', chapterTitle: 'T', content: '', contentHtml: '', wordCount: 0,
  });
});

test('snapshotsFromDraftHistory maps entries to automatic snapshots with fixed ids', () => {
  const chapter = {
    _id: 'ch_9', workId: 'w_9', title: 'Nine',
    draftHistory: [
      { savedAt: '2026-10-01T10:00:00.000Z', wordCount: 2, contentSnapshot: 'Old one.', htmlSnapshot: '<div>Old one.</div>' },
    ],
  };
  assert.deepEqual(snapshotsFromDraftHistory(chapter), [{
    _id: `snap_ch_9_${Date.parse('2026-10-01T10:00:00.000Z')}`,
    workId: 'w_9', chapterId: 'ch_9', chapterTitle: 'Nine', kind: 'auto', name: '', note: '', milestoneId: null,
    content: 'Old one.', contentHtml: '<div>Old one.</div>', wordCount: 2, createdAt: '2026-10-01T10:00:00.000Z',
  }]);
});

test('snapshotsFromDraftHistory skips bad dates and duplicate times', () => {
  const chapter = {
    _id: 'c', workId: 'w', title: 'T',
    draftHistory: [
      { savedAt: 'garbage', contentSnapshot: 'x' },
      { savedAt: '2026-10-01T10:00:00.000Z', contentSnapshot: 'first' },
      { savedAt: '2026-10-01T10:00:00.000Z', contentSnapshot: 'second' },
      {},
    ],
  };
  const docs = snapshotsFromDraftHistory(chapter);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].content, 'first');
  assert.deepEqual(snapshotsFromDraftHistory({ _id: 'c', workId: 'w', title: 'T' }), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix server test`
Expected: FAIL — cannot find `snapshotData.js`; 61 others pass.

- [ ] **Step 3: Implement `snapshotData.js`**

```js
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
```

- [ ] **Step 4: Run unit tests**

Run: `npm --prefix server test`
Expected: PASS — 65 tests.

- [ ] **Step 5: Start the throwaway stack and write the storage E2E script**

```bash
docker run -d --rm --name scriptorium-verify-mongo -p 27018:27017 docker.io/library/mongo:8
```

Start the server in the background (Bash `run_in_background`, from `server/`):

```bash
PORT=3011 NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake MONGODB_URI=mongodb://localhost:27018/scriptorium_verify DEV_AUTH_BYPASS=true ADMIN_EMAIL=dev@localhost node src/server.js > $SCRATCH/vh-server.log 2>&1
```

Restart it (needed after every server code change in Tasks 3–5) with:

```bash
ps -eo pid,args | awk '$2=="node" && $3=="src/server.js"{print $1}' | xargs -r kill
```

then the start command again. (Never use `pkill -f`: it kills its own shell.)

Write `$SCRATCH/vh-e2e-storage.mjs`:

```js
// Version history storage checks: automatic snapshots, thinning, cleanup, migration.
// Usage: node vh-e2e-storage.mjs seed   (then restart the server)
//        node vh-e2e-storage.mjs check  (run twice, restarting between, to prove re-runs are safe)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const B = 'http://localhost:3011/api';
const STATE = new URL('./vh-storage-state.json', import.meta.url);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  if (!ok) failures += 1;
};
async function j(method, path, body) {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const mongo = (js) =>
  execFileSync('docker', ['exec', 'scriptorium-verify-mongo', 'mongosh', '--quiet', 'scriptorium_verify', '--eval', js]).toString().trim();
const count = (filter) => Number(mongo(`print(db.snapshots.countDocuments(${JSON.stringify(filter)}))`));
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400000;

async function seed() {
  const W = (await j('POST', '/works', { title: 'History', genre: 'Drama' })).data.id;
  const C = (await j('POST', `/works/${W}/chapters`, { title: 'One' })).data.id;
  const put = (id, text) => j('PUT', `/works/${W}/chapters/${id}`, { content: text, contentHtml: `<div>${text}</div>` });

  // 1. First text: nothing to snapshot yet
  await put(C, 'First draft.');
  check('no snapshot for the first text', count({ chapterId: C }) === 0, String(count({ chapterId: C })));

  // 2. A change snapshots the previous text
  await put(C, 'Second draft.');
  const first = JSON.parse(mongo(`print(JSON.stringify(db.snapshots.findOne({ chapterId: '${C}' })))`));
  check('a change saves the previous text', first?.content === 'First draft.' && first.kind === 'auto' && first.workId === W, JSON.stringify(first));
  check('snapshot keeps html and title', first?.contentHtml === '<div>First draft.</div>' && first.chapterTitle === 'One', JSON.stringify(first));

  // 3. Within 10 minutes: no new snapshot
  await put(C, 'Third draft.');
  check('no second snapshot within 10 minutes', count({ chapterId: C }) === 1, String(count({ chapterId: C })));

  // 4. Thinning: three automatic snapshots on one day 5 days ago, plus a named one
  const day5 = new Date(Date.now() - 5 * DAY);
  const at = (h) => new Date(Date.UTC(day5.getUTCFullYear(), day5.getUTCMonth(), day5.getUTCDate(), h)).toISOString();
  mongo(`db.snapshots.insertMany([
    { _id: 'snap_t1', workId: '${W}', chapterId: '${C}', kind: 'auto', content: 'o1', createdAt: '${at(8)}' },
    { _id: 'snap_t2', workId: '${W}', chapterId: '${C}', kind: 'auto', content: 'o2', createdAt: '${at(12)}' },
    { _id: 'snap_t3', workId: '${W}', chapterId: '${C}', kind: 'auto', content: 'o3', createdAt: '${at(20)}' },
    { _id: 'snap_n1', workId: '${W}', chapterId: '${C}', kind: 'named', name: 'Keep', content: 'n', createdAt: '${at(9)}' },
  ])`);
  mongo(`db.snapshots.updateOne({ _id: '${first._id}' }, { $set: { createdAt: '${iso(20 * 60 * 1000)}' } })`);
  await put(C, 'Fourth draft.');
  const left = JSON.parse(mongo(`print(JSON.stringify(db.snapshots.find({ chapterId: '${C}' }).toArray().map(s => s._id).sort()))`));
  check('thinning keeps the newest of the old day and the named one',
    left.includes('snap_t3') && !left.includes('snap_t1') && !left.includes('snap_t2') && left.includes('snap_n1') && left.length === 4,
    JSON.stringify(left));

  // 5. Deleting a chapter keeps only its milestone snapshots
  const D = (await j('POST', `/works/${W}/chapters`, { title: 'Doomed' })).data.id;
  await put(D, 'Doomed one.');
  await put(D, 'Doomed two.');
  mongo(`db.snapshots.insertMany([
    { _id: 'snap_dm', workId: '${W}', chapterId: '${D}', kind: 'milestone', milestoneId: 'ms_x', content: 'm', createdAt: '${iso(0)}' },
    { _id: 'snap_dn', workId: '${W}', chapterId: '${D}', kind: 'named', name: 'N', content: 'n', createdAt: '${iso(0)}' },
  ])`);
  const del = await j('DELETE', `/works/${W}/chapters/${D}`);
  check('chapter delete 204', del.status === 204, JSON.stringify(del));
  check('chapter delete removes auto and named snapshots', count({ chapterId: D, kind: { $in: ['auto', 'named'] } }) === 0, String(count({ chapterId: D })));
  check('chapter delete keeps milestone snapshots', count({ chapterId: D, kind: 'milestone' }) === 1, String(count({ chapterId: D, kind: 'milestone' })));

  // 6. Deleting a work removes its snapshots and milestones
  const W2 = (await j('POST', '/works', { title: 'Doomed work', genre: 'Drama' })).data.id;
  const C2 = (await j('POST', `/works/${W2}/chapters`, { title: 'X' })).data.id;
  await j('PUT', `/works/${W2}/chapters/${C2}`, { content: 'a b', contentHtml: '<div>a b</div>' });
  await j('PUT', `/works/${W2}/chapters/${C2}`, { content: 'a b c', contentHtml: '<div>a b c</div>' });
  mongo(`db.milestones.insertOne({ _id: 'ms_w2', workId: '${W2}', name: 'M', createdAt: '${iso(0)}', chapters: [] })`);
  const wdel = await j('DELETE', `/works/${W2}`);
  check('work delete → 204', wdel.status === 204, JSON.stringify(wdel));
  check('work delete removes snapshots', count({ workId: W2 }) === 0, String(count({ workId: W2 })));
  check('work delete removes milestones', Number(mongo(`print(db.milestones.countDocuments({ workId: '${W2}' }))`)) === 0);

  // 7. Seed legacy history for the migration check
  const M = (await j('POST', `/works/${W}/chapters`, { title: 'Legacy' })).data.id;
  const E = (await j('POST', `/works/${W}/chapters`, { title: 'Legacy empty' })).data.id;
  mongo(`db.chapters.updateOne({ _id: '${M}' }, { $set: { draftHistory: [
    { savedAt: '2026-10-01T10:00:00.000Z', wordCount: 2, contentSnapshot: 'Old one.', htmlSnapshot: '<div>Old one.</div>' },
    { savedAt: 'bad', wordCount: 1, contentSnapshot: 'Bad.' },
  ] } })`);
  mongo(`db.chapters.updateOne({ _id: '${E}' }, { $set: { draftHistory: [] } })`);
  writeFileSync(STATE, JSON.stringify({ W, M, E }));
  console.log('\nSeeded. Restart the server, then run: node vh-e2e-storage.mjs check');
}

async function checkMigration() {
  const { M, E } = JSON.parse(readFileSync(STATE, 'utf8'));
  const id = `snap_${M}_${Date.parse('2026-10-01T10:00:00.000Z')}`;
  const snap = JSON.parse(mongo(`print(JSON.stringify(db.snapshots.findOne({ _id: '${id}' })))`));
  check('migrated entry exists', snap?.content === 'Old one.' && snap.kind === 'auto' && snap.chapterTitle === 'Legacy', JSON.stringify(snap));
  check('bad date skipped, nothing duplicated', count({ chapterId: M }) === 1, String(count({ chapterId: M })));
  const fields = JSON.parse(mongo(`print(JSON.stringify(db.chapters.find({ _id: { $in: ['${M}', '${E}'] } }, { draftHistory: 1 }).toArray()))`));
  check('draftHistory removed from both chapters', fields.length === 2 && fields.every((c) => !('draftHistory' in c)), JSON.stringify(fields));
}

if (process.argv[2] === 'seed') await seed();
else await checkMigration();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
```

- [ ] **Step 6: Run the E2E script to verify it fails**

Run: `node $SCRATCH/vh-e2e-storage.mjs seed`
Expected: FAIL — "a change saves the previous text" and the thinning/cleanup checks fail (snapshots still go into `draftHistory`).

- [ ] **Step 7: Add the models**

`server/src/models/Snapshot.js`:

```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const snapshotSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    chapterId: { type: String, required: true },
    chapterTitle: { type: String, default: '' },
    kind: { type: String, enum: ['auto', 'named', 'milestone'], required: true },
    name: { type: String, default: '' }, // the writer's name for a named snapshot
    note: { type: String, default: '' }, // system label, e.g. 'Before restore'
    milestoneId: { type: String, default: null },
    content: { type: String, default: '' },
    contentHtml: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
  },
  { toJSON: idTransform, versionKey: false }
);

snapshotSchema.index({ chapterId: 1, createdAt: -1 });
snapshotSchema.index({ milestoneId: 1 });

export default mongoose.model('Snapshot', snapshotSchema);
```

`server/src/models/Milestone.js`:

```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const milestoneChapterSchema = new mongoose.Schema(
  {
    chapterId: { type: String, required: true },
    title: { type: String, default: '' },
    order: { type: Number, default: 0 },
    snapshotId: { type: String, required: true },
    wordCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const milestoneSchema = new mongoose.Schema(
  {
    _id: { type: String },
    workId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    createdAt: { type: String, required: true },
    chapters: { type: [milestoneChapterSchema], default: [] },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Milestone', milestoneSchema);
```

In `server/src/models/Chapter.js`, delete `draftHistoryEntrySchema` (the whole `const draftHistoryEntrySchema = …;` block) and the line `draftHistory: { type: [draftHistoryEntrySchema], default: [] },`.

- [ ] **Step 8: Add `snapshotService.js`**

```js
import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import { countWords, recalculate } from './wordCountService.js';
import { thinSnapshots } from './snapshotRetention.js';
import { newSnapshotId, snapshotFields } from './snapshotData.js';

// Autosave runs every few seconds, so keep at most one automatic snapshot per interval
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

export async function autoSnapshotDue(chapterId, now) {
  const last = await Snapshot.findOne({ chapterId, kind: 'auto' }).sort({ createdAt: -1 }).select('createdAt').lean();
  if (!last) return true;
  return new Date(now) - new Date(last.createdAt) >= SNAPSHOT_INTERVAL_MS;
}

async function thinChapter(chapterId, now) {
  const rows = await Snapshot.find({ chapterId, kind: 'auto' }).select('_id kind createdAt').lean();
  const ids = thinSnapshots(rows.map((r) => ({ id: r._id, kind: r.kind, createdAt: r.createdAt })), now);
  if (ids.length) await Snapshot.deleteMany({ _id: { $in: ids }, kind: 'auto' });
}

// Saves the chapter's text (as passed: the pre-change document) as an
// automatic snapshot, then thins that chapter's automatic snapshots
export async function takeAutoSnapshot(chapter, now, { note = '' } = {}) {
  await Snapshot.create({ _id: newSnapshotId(), ...snapshotFields(chapter), kind: 'auto', note, createdAt: now });
  try {
    await thinChapter(chapter._id, now);
  } catch (err) {
    console.error('Snapshot thinning failed:', err);
  }
}

// Saves the current text as 'Before restore', then puts the snapshot's text back
export async function restoreFromSnapshot(chapter, snapshot) {
  const now = new Date().toISOString();
  await takeAutoSnapshot(chapter, now, { note: 'Before restore' });
  const content = snapshot.content || '';
  const updated = await Chapter.findOneAndUpdate(
    { _id: chapter._id, workId: chapter.workId },
    { $set: { content, contentHtml: snapshot.contentHtml || '', wordCount: countWords(content), updatedAt: now } },
    { new: true }
  );
  await recalculate(chapter.workId);
  return updated;
}
```

- [ ] **Step 9: Rewire `chapters.js`**

Imports: add `import Snapshot from '../models/Snapshot.js';` and `import { autoSnapshotDue, takeAutoSnapshot } from '../services/snapshotService.js';`.

Delete the block from `// Autosave runs every few seconds…` through the end of `function snapshotDue(…) { … }` (constants `SNAPSHOT_INTERVAL_MS`, `MAX_SNAPSHOTS`, functions `snapshotOf`, `snapshotDue`).

In `GET /`: `.select('-contentHtml -draftHistory')` → `.select('-contentHtml')`.
In `PUT /reorder`: `.select('-content -contentHtml -draftHistory')` → `.select('-content -contentHtml')`.
In `POST /`: delete the line `draftHistory: [],`.

In `PUT /:chapterId`, delete `delete setFields.draftHistory;` and replace

```js
    const updateOp = { $set: setFields };
    if (contentChanged && chapter.content && snapshotDue(chapter, now)) {
      updateOp.$push = {
        draftHistory: { $each: [snapshotOf(chapter, now)], $slice: -MAX_SNAPSHOTS },
      };
    }

    const updated = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, updateOp, { new: true });
```

with

```js
    const snapshotNeeded = contentChanged && chapter.content && (await autoSnapshotDue(chapterId, now));
    const updated = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, { $set: setFields }, { new: true });

    // `chapter` is the pre-save document, so this keeps the text being replaced.
    // A failed snapshot must not fail the save.
    if (snapshotNeeded) {
      try {
        await takeAutoSnapshot(chapter, now);
      } catch (snapErr) {
        console.error('Snapshot error:', snapErr);
      }
    }
```

Delete the whole `// POST /api/works/:workId/chapters/:chapterId/restore` route (it moves to the snapshots router in Task 4).

In `DELETE /:chapterId`, after the `if (!deleted) …` line add:

```js
    // Milestone snapshots stay so the chapter can be brought back from a milestone
    await Snapshot.deleteMany({ workId, chapterId, kind: { $in: ['auto', 'named'] } });
```

In `server/src/routes/ai.js:182` change `'-content -contentHtml -draftHistory'` → `'-content -contentHtml'`; in `server/src/services/exportService.js:22` change `'-contentHtml -draftHistory'` → `'-contentHtml'`.

- [ ] **Step 10: Cascade work deletion**

`server/src/services/workService.js`: add imports `import Snapshot from '../models/Snapshot.js';` and `import Milestone from '../models/Milestone.js';`, and two entries in the `Promise.all` array:

```js
    Snapshot.deleteMany({ workId }),
    Milestone.deleteMany({ workId }),
```

- [ ] **Step 11: Migration**

`server/src/services/snapshotMigration.js`:

```js
import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import { snapshotsFromDraftHistory } from './snapshotData.js';

// One-time move of the old embedded `draftHistory` into the Snapshot
// collection. Upserts by fixed ids, and only removes a chapter's
// `draftHistory` once its snapshots are stored, so a crash just re-runs.
export async function migrateDraftHistory() {
  const chapters = Chapter.collection.find(
    { draftHistory: { $exists: true } },
    { projection: { workId: 1, title: 1, draftHistory: 1 } }
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
```

`server/src/server.js`: add `import { migrateDraftHistory } from './services/snapshotMigration.js';` and in `start()` after `await connectMongo();`:

```js
  try {
    await migrateDraftHistory();
  } catch (err) {
    console.error('Draft history migration failed:', err);
  }
```

- [ ] **Step 12: Verify**

Restart the server. Run: `node $SCRATCH/vh-e2e-storage.mjs seed`
Expected: `ALL PASSED` (11 checks).

Restart the server, then run: `node $SCRATCH/vh-e2e-storage.mjs check`
Expected: `ALL PASSED` (3 checks); the server log shows `Moved draft history of 2 chapter(s) into snapshots`.

Restart again, run `node $SCRATCH/vh-e2e-storage.mjs check` again.
Expected: `ALL PASSED`; no "Moved draft history" line this time.

Run: `npm --prefix server test`
Expected: PASS — 65 tests.

- [ ] **Step 13: Commit**

```bash
git add server/src/services/snapshotData.js server/src/models/Snapshot.js server/src/models/Milestone.js server/src/services/snapshotService.js server/src/services/snapshotMigration.js server/src/routes/chapters.js server/src/models/Chapter.js server/src/services/workService.js server/src/server.js server/src/routes/ai.js server/src/services/exportService.js server/test/snapshotData.test.js
git commit -m "feat: store chapter snapshots in their own collection with thinning and migration"
```

---

### Task 4: Chapter snapshot API

**Files:**
- Create: `server/src/routes/snapshots.js`
- Modify: `server/src/server.js` (mount before the chapters router)
- Test: E2E `$SCRATCH/vh-e2e-snapshots.mjs`

**Interfaces:**
- Consumes: `Snapshot`, `Milestone`, `validateName`, `newSnapshotId`, `snapshotFields`, `restoreFromSnapshot`.
- Produces: `GET/POST /api/works/:workId/chapters/:chapterId/snapshots`, `GET/PATCH/DELETE …/:snapId`, `POST …/:snapId/restore`. List rows: `{ id, kind, name, note, milestoneId, milestoneName, wordCount, createdAt }`. Restore returns the chapter JSON (`id`, `content`, `contentHtml`, …).

- [ ] **Step 1: Write the E2E script**

`$SCRATCH/vh-e2e-snapshots.mjs`:

```js
// Chapter snapshot API checks against the throwaway stack
import { execFileSync } from 'node:child_process';

const B = 'http://localhost:3011/api';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  if (!ok) failures += 1;
};
async function j(method, path, body) {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const mongo = (js) =>
  execFileSync('docker', ['exec', 'scriptorium-verify-mongo', 'mongosh', '--quiet', 'scriptorium_verify', '--eval', js]).toString().trim();

const W = (await j('POST', '/works', { title: 'Snaps', genre: 'Drama' })).data.id;
const C = (await j('POST', `/works/${W}/chapters`, { title: 'One' })).data.id;
const S = `/works/${W}/chapters/${C}/snapshots`;
await j('PUT', `/works/${W}/chapters/${C}`, { content: 'Alpha one.', contentHtml: '<div>Alpha one.</div>' });
await j('PUT', `/works/${W}/chapters/${C}`, { content: 'Alpha two words.', contentHtml: '<div>Alpha two words.</div>' });

// List and fetch
let r = await j('GET', S);
check('list has the automatic snapshot', r.status === 200 && r.data.length === 1 && r.data[0].kind === 'auto' && r.data[0].wordCount === 2, JSON.stringify(r));
check('list has no text', r.data[0] && !('content' in r.data[0]) && !('contentHtml' in r.data[0]), JSON.stringify(r.data[0]));
check('list row shape', r.data[0] && ['id', 'kind', 'name', 'note', 'milestoneId', 'milestoneName', 'wordCount', 'createdAt'].every((k) => k in r.data[0]), JSON.stringify(r.data[0]));
const autoId = r.data[0].id;
r = await j('GET', `${S}/${autoId}`);
check('get returns the text', r.status === 200 && r.data.content === 'Alpha one.' && r.data.contentHtml === '<div>Alpha one.</div>' && r.data.id === autoId, JSON.stringify(r));

// Named snapshots
r = await j('POST', S, { name: '  Draft A  ' });
check('save named snapshot', r.status === 201 && r.data.kind === 'named' && r.data.name === 'Draft A' && !('content' in r.data), JSON.stringify(r));
const namedId = r.data.id;
r = await j('GET', `${S}/${namedId}`);
check('named snapshot holds the current text', r.data.content === 'Alpha two words.', JSON.stringify(r));
r = await j('POST', S, { name: '   ' });
check('blank name → 400 MISSING_FIELD', r.status === 400 && r.data.code === 'MISSING_FIELD', JSON.stringify(r));
r = await j('POST', S, { name: 'x'.repeat(81) });
check('81-character name → 400 TOO_LONG', r.status === 400 && r.data.code === 'TOO_LONG', JSON.stringify(r));
r = await j('GET', S);
check('newest first', r.data[0]?.id === namedId && r.data.length === 2, JSON.stringify(r.data));

// Keep / rename / delete
r = await j('PATCH', `${S}/${autoId}`, { name: 'Keeper' });
check('naming an automatic snapshot keeps it', r.status === 200 && r.data.kind === 'named' && r.data.name === 'Keeper', JSON.stringify(r));
r = await j('PATCH', `${S}/${namedId}`, { name: 'Draft B' });
check('rename named', r.status === 200 && r.data.name === 'Draft B', JSON.stringify(r));
r = await j('DELETE', `${S}/${namedId}`);
check('delete named → 204', r.status === 204, JSON.stringify(r));
r = await j('GET', `${S}/${namedId}`);
check('deleted snapshot → 404', r.status === 404, JSON.stringify(r));

// Milestone and automatic snapshots are protected
mongo(`db.milestones.insertOne({ _id: 'ms_snaps', workId: '${W}', name: 'Beta', createdAt: new Date().toISOString(), chapters: [] })`);
mongo(`db.snapshots.insertMany([
  { _id: 'snap_ms_${C}', workId: '${W}', chapterId: '${C}', kind: 'milestone', milestoneId: 'ms_snaps', content: 'M', wordCount: 1, createdAt: new Date(Date.now() - 1000).toISOString() },
  { _id: 'snap_auto_${C}', workId: '${W}', chapterId: '${C}', kind: 'auto', content: 'A', wordCount: 1, createdAt: new Date(Date.now() - 2000).toISOString() },
])`);
r = await j('GET', S);
const msRow = r.data.find((s) => s.id === `snap_ms_${C}`);
check('milestone snapshot shows its milestone name', msRow?.milestoneName === 'Beta' && msRow.milestoneId === 'ms_snaps', JSON.stringify(msRow));
r = await j('PATCH', `${S}/snap_ms_${C}`, { name: 'Nope' });
check('rename milestone snapshot → 400 NOT_ALLOWED', r.status === 400 && r.data.code === 'NOT_ALLOWED', JSON.stringify(r));
r = await j('DELETE', `${S}/snap_ms_${C}`);
check('delete milestone snapshot → 400 NOT_ALLOWED', r.status === 400 && r.data.code === 'NOT_ALLOWED', JSON.stringify(r));
r = await j('DELETE', `${S}/snap_auto_${C}`);
check('delete automatic snapshot → 400 NOT_ALLOWED', r.status === 400 && r.data.code === 'NOT_ALLOWED', JSON.stringify(r));

// Restore
r = await j('POST', `${S}/${autoId}/restore`);
check('restore returns the restored chapter', r.status === 200 && r.data.content === 'Alpha one.' && r.data.contentHtml === '<div>Alpha one.</div>' && r.data.wordCount === 2, JSON.stringify(r));
r = await j('GET', S);
const before = r.data.find((s) => s.note === 'Before restore');
check('restore saved a Before restore snapshot', before?.kind === 'auto', JSON.stringify(r.data));
r = await j('GET', `${S}/${before?.id}`);
check('Before restore holds the replaced text', r.data.content === 'Alpha two words.', JSON.stringify(r));
r = await j('GET', `/works/${W}`);
check('work word count recalculated', r.data.wordCount === 2, JSON.stringify(r.data).slice(0, 200));
r = await j('POST', `/works/${W}/chapters/${C}/restore`, { savedAt: 'x' });
check('old restore route is gone', r.status === 404, JSON.stringify(r));

// Scoping
const W2 = (await j('POST', '/works', { title: 'Other', genre: 'Drama' })).data.id;
const C2 = (await j('POST', `/works/${W2}/chapters`, { title: 'Other one' })).data.id;
r = await j('GET', `/works/${W2}/chapters/${C}/snapshots`);
check('chapter from another work → 404', r.status === 404, JSON.stringify(r));
r = await j('GET', `/works/${W2}/chapters/${C2}/snapshots/${autoId}`);
check('snapshot of another chapter → 404', r.status === 404, JSON.stringify(r));
r = await j('POST', `/works/${W2}/chapters/${C2}/snapshots/${autoId}/restore`);
check('restore another chapter’s snapshot → 404', r.status === 404, JSON.stringify(r));
r = await j('GET', `/works/work_nope/chapters/${C}/snapshots`);
check('unknown work → 404', r.status === 404, JSON.stringify(r));

console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node $SCRATCH/vh-e2e-snapshots.mjs`
Expected: FAIL — list/get/save checks fail with 404 (route not mounted).

- [ ] **Step 3: Implement `routes/snapshots.js`**

```js
import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import Milestone from '../models/Milestone.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { validateName } from '../services/snapshotNames.js';
import { newSnapshotId, snapshotFields } from '../services/snapshotData.js';
import { restoreFromSnapshot } from '../services/snapshotService.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// Every route acts on one chapter of the work
router.use(async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    req.chapter = chapter;
    next();
  } catch (err) {
    next(err);
  }
});

function listRow(snapshot, milestoneName = '') {
  return {
    id: snapshot._id,
    kind: snapshot.kind,
    name: snapshot.name || '',
    note: snapshot.note || '',
    milestoneId: snapshot.milestoneId || null,
    milestoneName,
    wordCount: snapshot.wordCount || 0,
    createdAt: snapshot.createdAt,
  };
}

async function findSnapshot(req) {
  const { workId, chapterId, snapId } = req.params;
  const snapshot = await Snapshot.findOne({ _id: snapId, workId, chapterId });
  if (!snapshot) throw httpError(404, 'NOT_FOUND', 'Snapshot not found');
  return snapshot;
}

// GET /api/works/:workId/chapters/:chapterId/snapshots — newest first, without text
router.get('/', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const snapshots = await Snapshot.find({ workId, chapterId })
      .select('-content -contentHtml')
      .sort({ createdAt: -1 })
      .lean();
    const milestoneIds = [...new Set(snapshots.map((s) => s.milestoneId).filter(Boolean))];
    const milestones = milestoneIds.length
      ? await Milestone.find({ _id: { $in: milestoneIds }, workId }).select('name').lean()
      : [];
    const names = new Map(milestones.map((m) => [m._id, m.name]));
    res.json(snapshots.map((s) => listRow(s, s.milestoneId ? names.get(s.milestoneId) || '' : '')));
  } catch (err) {
    next(err);
  }
});

// GET …/snapshots/:snapId — with text
router.get('/:snapId', async (req, res, next) => {
  try {
    res.json(await findSnapshot(req));
  } catch (err) {
    next(err);
  }
});

// POST …/snapshots { name } — save the current text as a named snapshot
router.post('/', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const snapshot = await Snapshot.create({
      _id: newSnapshotId(),
      ...snapshotFields(req.chapter),
      kind: 'named',
      name,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(listRow(snapshot));
  } catch (err) {
    next(err);
  }
});

// PATCH …/snapshots/:snapId { name } — rename, or name an automatic snapshot to keep it
router.patch('/:snapId', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const snapshot = await findSnapshot(req);
    if (snapshot.kind === 'milestone') {
      return next(httpError(400, 'NOT_ALLOWED', 'Milestone snapshots are renamed with their milestone'));
    }
    snapshot.kind = 'named';
    snapshot.name = name;
    await snapshot.save();
    res.json(listRow(snapshot));
  } catch (err) {
    next(err);
  }
});

// DELETE …/snapshots/:snapId — named snapshots only
router.delete('/:snapId', async (req, res, next) => {
  try {
    const snapshot = await findSnapshot(req);
    if (snapshot.kind !== 'named') {
      return next(httpError(400, 'NOT_ALLOWED', 'Only named snapshots can be deleted'));
    }
    await Snapshot.deleteOne({ _id: snapshot._id, workId: req.params.workId });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST …/snapshots/:snapId/restore — saves the current text first
router.post('/:snapId/restore', async (req, res, next) => {
  try {
    const snapshot = await findSnapshot(req);
    res.json(await restoreFromSnapshot(req.chapter, snapshot));
  } catch (err) {
    next(err);
  }
});

export default router;
```

In `server/src/server.js`: add `import snapshotsRouter from './routes/snapshots.js';` and mount it on the line **before** the chapters router:

```js
app.use('/api/works/:workId/chapters/:chapterId/snapshots', auth, snapshotsRouter);
```

- [ ] **Step 4: Verify**

Restart the server. Run: `node $SCRATCH/vh-e2e-snapshots.mjs`
Expected: `ALL PASSED` (26 checks).

Run: `node $SCRATCH/vh-e2e-storage.mjs seed` (after a restart, against the same database)
Expected: `ALL PASSED` — no regression.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/snapshots.js server/src/server.js
git commit -m "feat: chapter snapshot API — list, compare text, name, keep, delete, restore"
```

---

### Task 5: Milestone API

**Files:**
- Create: `server/src/routes/milestones.js`
- Modify: `server/src/server.js`, `CLAUDE.md` (structure lists)
- Test: E2E `$SCRATCH/vh-e2e-milestones.mjs`

**Interfaces:**
- Consumes: `Snapshot`, `Milestone`, `validateName`, `newSnapshotId`, `newMilestoneId`, `snapshotFields`, `restoreFromSnapshot`, `milestoneRows`, `countWords`, `recalculate`.
- Produces: `GET/POST /api/works/:workId/milestones` (rows `{ id, name, createdAt, chapterCount, wordCount }`), `GET /:id` → `{ id, name, createdAt, chapters: Row[] }`, `POST /:id/chapters/:chapterId/restore` → `{ chapter, recreated }`, `PATCH /:id`, `DELETE /:id`.

- [ ] **Step 1: Write the E2E script**

`$SCRATCH/vh-e2e-milestones.mjs`:

```js
// Milestone API checks against the throwaway stack
import { execFileSync } from 'node:child_process';

const B = 'http://localhost:3011/api';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  if (!ok) failures += 1;
};
async function j(method, path, body) {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const mongo = (js) =>
  execFileSync('docker', ['exec', 'scriptorium-verify-mongo', 'mongosh', '--quiet', 'scriptorium_verify', '--eval', js]).toString().trim();

const W = (await j('POST', '/works', { title: 'Milestones', genre: 'Drama' })).data.id;
const mk = async (title, text) => {
  const id = (await j('POST', `/works/${W}/chapters`, { title })).data.id;
  if (text) await j('PUT', `/works/${W}/chapters/${id}`, { content: text, contentHtml: `<div>${text}</div>` });
  return id;
};
const A = await mk('Alpha', 'One two three.');
const Bc = await mk('Beta', 'Bee text.');
const C = await mk('Gamma', '');
const M = `/works/${W}/milestones`;

let r = await j('POST', M, { name: '' });
check('blank name → 400 MISSING_FIELD', r.status === 400 && r.data.code === 'MISSING_FIELD', JSON.stringify(r));
r = await j('POST', M, { name: '  Draft 1 ' });
check('create milestone', r.status === 201 && r.data.name === 'Draft 1' && r.data.chapterCount === 3 && r.data.wordCount === 5, JSON.stringify(r));
const msId = r.data.id;
check('one milestone snapshot per chapter', Number(mongo(`print(db.snapshots.countDocuments({ milestoneId: '${msId}', kind: 'milestone', workId: '${W}' }))`)) === 3);
r = await j('GET', M);
check('list', r.status === 200 && r.data.length === 1 && r.data[0].id === msId && r.data[0].chapterCount === 3, JSON.stringify(r));

// Change things after the milestone
await j('PUT', `/works/${W}/chapters/${A}`, { content: 'One two four.', contentHtml: '<div>One two four.</div>' });
await j('DELETE', `/works/${W}/chapters/${Bc}`);
const D = await mk('Delta', 'New stuff here.');

r = await j('GET', `${M}/${msId}`);
const rows = r.data.chapters || [];
check('comparison rows in order', JSON.stringify(rows.map((x) => [x.chapterId, x.state])) === JSON.stringify([[A, 'changed'], [C, 'unchanged'], [D, 'new'], [Bc, 'deleted']]), JSON.stringify(rows));
const rowA = rows.find((x) => x.chapterId === A);
check('changed row counts words', rowA?.added === 1 && rowA.removed === 1 && rowA.wordsThen === 3 && rowA.wordsNow === 3, JSON.stringify(rowA));
const rowB = rows.find((x) => x.chapterId === Bc);
check('deleted row', rowB?.title === 'Beta' && rowB.removed === 2 && rowB.snapshotId, JSON.stringify(rowB));

// Milestone snapshots are reachable through the chapter snapshot API
r = await j('GET', `/works/${W}/chapters/${A}/snapshots/${rowA.snapshotId}`);
check('compare text available', r.status === 200 && r.data.content === 'One two three.', JSON.stringify(r));

// Restore an existing chapter
r = await j('POST', `${M}/${msId}/chapters/${A}/restore`);
check('restore existing chapter', r.status === 200 && r.data.recreated === false && r.data.chapter?.content === 'One two three.', JSON.stringify(r));
r = await j('GET', `/works/${W}/chapters/${A}/snapshots`);
check('restore saved Before restore', r.data.some((s) => s.note === 'Before restore'), JSON.stringify(r.data));

// Bring back a deleted chapter
r = await j('POST', `${M}/${msId}/chapters/${Bc}/restore`);
check('bring back', r.status === 201 && r.data.recreated === true && r.data.chapter?.id === Bc && r.data.chapter.content === 'Bee text.' && r.data.chapter.status === 'draft', JSON.stringify(r));
r = await j('GET', `/works/${W}/chapters`);
check('brought back at the end', r.data[r.data.length - 1]?.id === Bc && r.data.length === 4, JSON.stringify(r.data.map((c) => [c.id, c.order])));
r = await j('GET', `/works/${W}`);
check('work chapter count and words updated', r.data.chapterCount === 4 && r.data.wordCount === 3 + 2 + 3, JSON.stringify(r.data).slice(0, 200));
r = await j('POST', `${M}/${msId}/chapters/${Bc}/restore`);
check('bring back again is a normal restore', r.status === 200 && r.data.recreated === false, JSON.stringify(r));
r = await j('POST', `${M}/${msId}/chapters/${D}/restore`);
check('chapter not in milestone → 404', r.status === 404, JSON.stringify(r));

// Rename and delete
r = await j('PATCH', `${M}/${msId}`, { name: 'First draft' });
check('rename', r.status === 200 && r.data.name === 'First draft', JSON.stringify(r));
r = await j('PATCH', `${M}/${msId}`, { name: 'x'.repeat(81) });
check('rename too long → 400', r.status === 400 && r.data.code === 'TOO_LONG', JSON.stringify(r));

// Empty work, scoping
const W3 = (await j('POST', '/works', { title: 'Empty', genre: 'Drama' })).data.id;
r = await j('POST', `/works/${W3}/milestones`, { name: 'Nothing yet' });
check('milestone on an empty work', r.status === 201 && r.data.chapterCount === 0 && r.data.wordCount === 0, JSON.stringify(r));
r = await j('GET', `/works/${W3}/milestones/${msId}`);
check('milestone from another work → 404', r.status === 404, JSON.stringify(r));
r = await j('DELETE', `/works/${W3}/milestones/${msId}`);
check('delete from another work → 404', r.status === 404, JSON.stringify(r));

r = await j('DELETE', `${M}/${msId}`);
check('delete → 204', r.status === 204, JSON.stringify(r));
check('delete removes its snapshots', Number(mongo(`print(db.snapshots.countDocuments({ milestoneId: '${msId}' }))`)) === 0);
r = await j('GET', `${M}/${msId}`);
check('deleted milestone → 404', r.status === 404, JSON.stringify(r));

console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node $SCRATCH/vh-e2e-milestones.mjs`
Expected: FAIL — milestone routes 404.

- [ ] **Step 3: Implement `routes/milestones.js`**

```js
import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import Snapshot from '../models/Snapshot.js';
import Milestone from '../models/Milestone.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { countWords, recalculate } from '../services/wordCountService.js';
import { validateName } from '../services/snapshotNames.js';
import { newMilestoneId, newSnapshotId, snapshotFields } from '../services/snapshotData.js';
import { restoreFromSnapshot } from '../services/snapshotService.js';
import { milestoneRows } from '../services/milestoneCompare.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

function listRow(milestone) {
  return {
    id: milestone._id,
    name: milestone.name,
    createdAt: milestone.createdAt,
    chapterCount: milestone.chapters.length,
    wordCount: milestone.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0),
  };
}

async function findMilestone(req) {
  const milestone = await Milestone.findOne({ _id: req.params.id, workId: req.params.workId });
  if (!milestone) throw httpError(404, 'NOT_FOUND', 'Milestone not found');
  return milestone;
}

// GET /api/works/:workId/milestones
router.get('/', async (req, res, next) => {
  try {
    const milestones = await Milestone.find({ workId: req.params.workId }).sort({ createdAt: -1 }).lean();
    res.json(milestones.map(listRow));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/milestones { name } — snapshot every chapter
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const name = validateName(req.body.name);
    const now = new Date().toISOString();
    const milestoneId = newMilestoneId();
    const chapters = await Chapter.find({ workId }).sort({ order: 1 }).lean();
    const snapshots = chapters.map((ch) => ({
      _id: newSnapshotId(),
      ...snapshotFields(ch),
      kind: 'milestone',
      milestoneId,
      createdAt: now,
    }));
    if (snapshots.length) await Snapshot.insertMany(snapshots);
    let milestone;
    try {
      milestone = await Milestone.create({
        _id: milestoneId,
        workId,
        name,
        createdAt: now,
        chapters: chapters.map((ch, i) => ({
          chapterId: ch._id,
          title: ch.title,
          order: ch.order,
          snapshotId: snapshots[i]._id,
          wordCount: ch.wordCount || 0,
        })),
      });
    } catch (err) {
      await Snapshot.deleteMany({ milestoneId, workId }).catch(() => {});
      throw err;
    }
    res.status(201).json(listRow(milestone));
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/milestones/:id — compared with today
router.get('/:id', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const milestone = await findMilestone(req);
    const [current, snapshots] = await Promise.all([
      Chapter.find({ workId }).select('title order content wordCount').sort({ order: 1 }).lean(),
      Snapshot.find({ milestoneId: milestone._id, workId }).select('content').lean(),
    ]);
    const texts = new Map(snapshots.map((s) => [s._id, s.content || '']));
    res.json({
      id: milestone._id,
      name: milestone.name,
      createdAt: milestone.createdAt,
      chapters: milestoneRows(milestone.chapters, texts, current),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/milestones/:id/chapters/:chapterId/restore
// Restores one chapter; a chapter deleted since is recreated with its original id
router.post('/:id/chapters/:chapterId/restore', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const milestone = await findMilestone(req);
    const entry = milestone.chapters.find((c) => c.chapterId === chapterId);
    if (!entry) return next(httpError(404, 'NOT_FOUND', 'Chapter is not in this milestone'));
    const snapshot = await Snapshot.findOne({ _id: entry.snapshotId, workId });
    if (!snapshot) return next(httpError(404, 'NOT_FOUND', 'Snapshot not found'));

    const existing = await Chapter.findOne({ _id: chapterId, workId });
    if (existing) {
      const chapter = await restoreFromSnapshot(existing, snapshot);
      return res.json({ chapter, recreated: false });
    }

    const now = new Date().toISOString();
    const [last, count] = await Promise.all([
      Chapter.findOne({ workId }).sort({ order: -1 }).select('order').lean(),
      Chapter.countDocuments({ workId }),
    ]);
    const content = snapshot.content || '';
    const chapter = await Chapter.create({
      _id: chapterId,
      workId,
      number: count + 1,
      title: entry.title,
      order: last ? last.order + 1 : 0,
      content,
      contentHtml: snapshot.contentHtml || '',
      wordCount: countWords(content),
      status: 'draft',
      notes: '',
      createdAt: now,
      lastEditedAt: now,
      updatedAt: now,
    });
    await Work.findByIdAndUpdate(workId, { chapterCount: count + 1, updatedAt: now });
    await recalculate(workId);
    res.status(201).json({ chapter, recreated: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/works/:workId/milestones/:id { name }
router.patch('/:id', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const milestone = await findMilestone(req);
    milestone.name = name;
    await milestone.save();
    res.json(listRow(milestone));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/milestones/:id — with its snapshots
router.delete('/:id', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const milestone = await findMilestone(req);
    await Snapshot.deleteMany({ milestoneId: milestone._id, workId });
    await Milestone.deleteOne({ _id: milestone._id, workId });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

`server/src/server.js`: add `import milestonesRouter from './routes/milestones.js';` and, after the chapters line:

```js
app.use('/api/works/:workId/milestones', auth, milestonesRouter);
```

`CLAUDE.md` structure block: in the `models/` comment add `Snapshot, Milestone` to the content list; in the `services/` comment add `snapshotService, snapshotMigration, textDiff`; in the `routes/` comment add `snapshots, milestones`.

- [ ] **Step 4: Verify**

Restart the server. Run: `node $SCRATCH/vh-e2e-milestones.mjs`
Expected: `ALL PASSED` (23 checks).

Run: `node $SCRATCH/vh-e2e-snapshots.mjs` and `npm --prefix server test`
Expected: `ALL PASSED`; 65 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/milestones.js server/src/server.js CLAUDE.md
git commit -m "feat: whole-work milestones — compare with today, restore or bring back chapters"
```

---

### Task 6: Client diff and history helpers

**Files:**
- Modify: `client/src/utils/polishDiff.js` (add `paragraphSpans`; `diffSentences` takes an optional splitter), `client/src/utils/api.js` (`patch`)
- Create: `client/src/utils/historyDiff.js`, `client/src/utils/versionHistory.js`
- Test: `client/test/historyDiff.test.js`, `client/test/versionHistory.test.js`

**Interfaces:**
- Consumes: `diffSentences`, `diffWords`, `sentenceSpans` from `polishDiff.js`.
- Produces:
  - `polishDiff.js`: `paragraphSpans(text): {text,start,end}[]`; `diffSentences(original, rewrite, split = sentenceSpans)`.
  - `historyDiff.js`: `MAX_DIFF_CELLS`; `buildHistoryDiff(before, after, { maxCells }?) → { segments: ({type:'equal', text} | {type:'change', parts:{type:'same'|'del'|'add', text}[]})[], added, removed, paragraphLevel }`; `collapseUnchanged(segments, context = 1) → (… | {type:'collapsed', text, paragraphs})[]`.
  - `versionHistory.js`: `CURRENT = 'current'`, `versionLabel(v)`, `dayLabel(iso, now?)`, `groupByDay(versions, now?) → {label, items}[]`, `defaultMilestoneName(now?)`, `orderPair(a, b) → [older, newer]`, `flushOpenChapter(api, workId, editorState, chapterId): Promise<void>`.
  - `api.patch(path, body)`.

- [ ] **Step 1: Write the failing tests**

`client/test/historyDiff.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryDiff, collapseUnchanged } from '../src/utils/historyDiff.js';
import { paragraphSpans } from '../src/utils/polishDiff.js';

const texts = (segments) => segments.map((s) => s.text ?? s.parts.map((p) => p.text).join('|'));

test('identical texts give only equal segments', () => {
  const diff = buildHistoryDiff('One. Two.\nThree.', 'One. Two.\nThree.');
  assert.ok(diff.segments.every((s) => s.type === 'equal'));
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.paragraphLevel, false);
});

test('trailing whitespace alone is not a change', () => {
  const diff = buildHistoryDiff('One. Two.', 'One.  Two.');
  assert.ok(diff.segments.every((s) => s.type === 'equal'));
});

test('a one-word edit counts one word each way', () => {
  const diff = buildHistoryDiff('Start. The cat sat. End.', 'Start. The dog sat. End.');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  const change = diff.segments.find((s) => s.type === 'change');
  assert.deepEqual(change.parts, [
    { type: 'same', text: 'The ' },
    { type: 'del', text: 'cat' },
    { type: 'add', text: 'dog' },
    { type: 'same', text: ' sat. ' },
  ]);
});

test('an added paragraph counts its words', () => {
  const diff = buildHistoryDiff('A start.', 'A start.\nBrand new line.');
  assert.equal(diff.added, 3);
  assert.equal(diff.removed, 0);
});

test('falls back to paragraphs when sentences are too many to align', () => {
  // 6 × 6 sentences exceed 20 cells; the changed paragraph's 2 × 2 words × 4 don't
  const before = 'A. B. C. D. E.\nCat sat.';
  const after = 'A. B. C. D. E.\nDog sat.';
  const diff = buildHistoryDiff(before, after, { maxCells: 20 });
  assert.equal(diff.paragraphLevel, true);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.deepEqual(texts(diff.segments), ['A. B. C. D. E.\n', 'Cat|Dog| sat.']);
});

test('a change too large to compare word by word shows as one removal and one addition', () => {
  const diff = buildHistoryDiff('Alpha beta gamma.', 'Delta beta epsilon.', { maxCells: 8 });
  const change = diff.segments.find((s) => s.type === 'change');
  assert.deepEqual(change.parts, [
    { type: 'del', text: 'Alpha beta gamma.' },
    { type: 'add', text: 'Delta beta epsilon.' },
  ]);
  assert.equal(diff.added, 3);
  assert.equal(diff.removed, 3);
});

test('paragraphSpans splits after each line break and round-trips', () => {
  const text = 'A\nB\n\nC';
  const spans = paragraphSpans(text);
  assert.deepEqual(spans.map((s) => s.text), ['A\n', 'B\n', '\n', 'C']);
  assert.equal(spans.map((s) => s.text).join(''), text);
  assert.deepEqual(paragraphSpans(''), []);
});

const change = { type: 'change', parts: [{ type: 'add', text: 'X' }] };

test('collapseUnchanged hides long unchanged stretches, keeping context next to changes', () => {
  const segments = [
    { type: 'equal', text: 'P1\nP2\n' },
    { type: 'equal', text: 'P3\nP4\nP5\nThe ' },
    change,
    { type: 'equal', text: ' sat.\nQ1\nQ2\nQ3\nQ4' },
  ];
  const out = collapseUnchanged(segments);
  assert.deepEqual(out, [
    { type: 'collapsed', text: 'P1\nP2\nP3\nP4\n', paragraphs: 4 },
    { type: 'equal', text: 'P5\nThe ' },
    change,
    { type: 'equal', text: ' sat.\nQ1\n' },
    { type: 'collapsed', text: 'Q2\nQ3\nQ4', paragraphs: 3 },
  ]);
});

test('collapseUnchanged keeps short stretches between changes', () => {
  const segments = [change, { type: 'equal', text: 'A\nB\nC\n' }, change];
  assert.deepEqual(collapseUnchanged(segments), [change, { type: 'equal', text: 'A\nB\nC\n' }, change]);
});

test('collapseUnchanged hides the middle of a long stretch between changes', () => {
  const segments = [change, { type: 'equal', text: 'end.\nA\nB\nC\nD\nstart ' }, change];
  assert.deepEqual(collapseUnchanged(segments), [
    change,
    { type: 'equal', text: 'end.\nA\n' },
    { type: 'collapsed', text: 'B\nC\n', paragraphs: 2 },
    { type: 'equal', text: 'D\nstart ' },
    change,
  ]);
});
```

`client/test/versionHistory.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT, versionLabel, dayLabel, groupByDay, defaultMilestoneName, orderPair, flushOpenChapter,
} from '../src/utils/versionHistory.js';

test('versionLabel per kind', () => {
  assert.equal(versionLabel({ kind: 'named', name: 'Draft A' }), '★ Draft A');
  assert.equal(versionLabel({ kind: 'milestone', milestoneName: 'Beta' }), '◆ Beta');
  assert.equal(versionLabel({ kind: 'milestone', milestoneName: '' }), '◆ Milestone');
  assert.equal(versionLabel({ kind: 'auto', note: 'Before restore' }), 'Before restore');
  assert.equal(versionLabel({ kind: 'auto', note: '' }), 'Autosave');
});

test('dayLabel says Today, Yesterday, then the date', () => {
  const now = new Date(2026, 9, 11, 12);
  assert.equal(dayLabel(new Date(2026, 9, 11, 1).toISOString(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 9, 10, 23).toISOString(), now), 'Yesterday');
  assert.equal(dayLabel(new Date(2026, 9, 3, 9).toISOString(), now), '3 Oct 2026');
});

test('groupByDay keeps order and groups neighbours', () => {
  const now = new Date(2026, 9, 11, 12);
  const v = (id, d) => ({ id, createdAt: d.toISOString() });
  const groups = groupByDay([
    v('a', new Date(2026, 9, 11, 11)),
    v('b', new Date(2026, 9, 11, 9)),
    v('c', new Date(2026, 9, 10, 9)),
    v('d', new Date(2026, 9, 3, 9)),
  ], now);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    ['3 Oct 2026', ['d']],
  ]);
});

test('defaultMilestoneName uses the en-GB date', () => {
  assert.equal(defaultMilestoneName(new Date(2026, 9, 11, 12)), 'Milestone — 11 Oct 2026');
});

test('orderPair puts the older version first and the current text last', () => {
  const old = { id: 's1', createdAt: '2026-10-01T00:00:00.000Z' };
  const newer = { id: 's2', createdAt: '2026-10-05T00:00:00.000Z' };
  const current = { id: CURRENT, createdAt: null };
  assert.deepEqual(orderPair(newer, old), [old, newer]);
  assert.deepEqual(orderPair(current, old), [old, current]);
  assert.deepEqual(orderPair(old, current), [old, current]);
});

test('flushOpenChapter saves unsaved editor text for the open chapter only', async () => {
  const calls = [];
  const api = { put: async (path, body) => calls.push([path, body]) };
  const editor = { chapterId: 'c1', hasUnsavedChanges: true, content: 'Typed.', html: '<div>Typed.</div>' };
  await flushOpenChapter(api, 'w1', editor, 'c2');
  await flushOpenChapter(api, 'w1', { ...editor, hasUnsavedChanges: false }, 'c1');
  assert.equal(calls.length, 0);
  await flushOpenChapter(api, 'w1', editor, 'c1');
  assert.deepEqual(calls, [['/works/w1/chapters/c1', { content: 'Typed.', contentHtml: '<div>Typed.</div>' }]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix client test`
Expected: FAIL — cannot find `historyDiff.js` / `versionHistory.js` (and `paragraphSpans` is not exported); the 33 existing tests pass.

- [ ] **Step 3: Implement**

`client/src/utils/polishDiff.js` — add after `splitSentences`:

```js
// One span per line, each keeping its '\n'
export function paragraphSpans(text) {
  if (!text) return [];
  const spans = [];
  let last = 0;
  for (const match of text.matchAll(/\n/g)) {
    const end = match.index + 1;
    spans.push({ text: text.slice(last, end), start: last, end });
    last = end;
  }
  if (last < text.length) spans.push({ text: text.slice(last), start: last, end: text.length });
  return spans;
}
```

and change the first lines of `diffSentences`:

```js
export function diffSentences(original, rewrite, split = sentenceSpans) {
  const a = split(original);
  const b = split(rewrite);
```

`client/src/utils/historyDiff.js`:

```js
// Comparison of two versions of a chapter for the history views. Pure.
import { diffSentences, diffWords, sentenceSpans, paragraphSpans } from './polishDiff.js';

export const MAX_DIFF_CELLS = 4_000_000;

const wordCount = (text) => (text.match(/\S+/g) || []).length;

function changeParts(fromText, toText, maxCells) {
  // diffWords compares tokens (words, spaces, punctuation), roughly 2× words each side
  if (wordCount(fromText) * wordCount(toText) * 4 > maxCells) {
    return [
      ...(fromText ? [{ type: 'del', text: fromText }] : []),
      ...(toText ? [{ type: 'add', text: toText }] : []),
    ];
  }
  return diffWords(fromText, toText);
}

export function buildHistoryDiff(before, after, { maxCells = MAX_DIFF_CELLS } = {}) {
  const a = before || '';
  const b = after || '';
  const paragraphLevel = sentenceSpans(a).length * sentenceSpans(b).length > maxCells;
  const raw = diffSentences(a, b, paragraphLevel ? paragraphSpans : sentenceSpans);

  let added = 0;
  let removed = 0;
  const segments = raw.map((seg) => {
    if (seg.type === 'equal') return { type: 'equal', text: seg.text };
    const parts = changeParts(seg.fromText, seg.toText, maxCells);
    for (const part of parts) {
      if (part.type === 'add') added += wordCount(part.text);
      if (part.type === 'del') removed += wordCount(part.text);
    }
    return { type: 'change', parts };
  });
  return { segments, added, removed, paragraphLevel };
}

const lines = (text) => text.split(/(?<=\n)/);

// Hides the middle of long unchanged stretches. Next to a change it keeps
// the partial line touching the change plus `context` whole lines.
export function collapseUnchanged(segments, context = 1) {
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === 'equal' && last?.type === 'equal') merged[merged.length - 1] = { type: 'equal', text: last.text + seg.text };
    else merged.push(seg);
  }

  const out = [];
  merged.forEach((seg, i) => {
    if (seg.type !== 'equal') {
      out.push(seg);
      return;
    }
    const pieces = lines(seg.text);
    const head = i > 0 ? context + 1 : 0;
    const tail = i < merged.length - 1 ? context + 1 : 0;
    const hidden = pieces.length - head - tail;
    if (hidden < 2) {
      out.push(seg);
      return;
    }
    if (head) out.push({ type: 'equal', text: pieces.slice(0, head).join('') });
    out.push({ type: 'collapsed', text: pieces.slice(head, head + hidden).join(''), paragraphs: hidden });
    if (tail) out.push({ type: 'equal', text: pieces.slice(head + hidden).join('') });
  });
  return out;
}
```

`client/src/utils/versionHistory.js`:

```js
// Helpers for the chapter history and milestone views. Pure except
// flushOpenChapter, which takes the api object so it can be tested.

export const CURRENT = 'current';

const DATE_FORMAT = { day: 'numeric', month: 'short', year: 'numeric' };

export function versionLabel(version) {
  if (version.kind === 'named') return `★ ${version.name}`;
  if (version.kind === 'milestone') return `◆ ${version.milestoneName || 'Milestone'}`;
  return version.note || 'Autosave';
}

export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', DATE_FORMAT);
}

export function groupByDay(versions, now = new Date()) {
  const groups = [];
  for (const version of versions) {
    const label = dayLabel(version.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(version);
    else groups.push({ label, items: [version] });
  }
  return groups;
}

export function defaultMilestoneName(now = new Date()) {
  return `Milestone — ${now.toLocaleDateString('en-GB', DATE_FORMAT)}`;
}

const timeOf = (version) => (version.id === CURRENT ? Infinity : Date.parse(version.createdAt));

// [older, newer]; the current text is always the newer side
export function orderPair(a, b) {
  return timeOf(a) <= timeOf(b) ? [a, b] : [b, a];
}

// Saves typing autosave hasn't stored yet, so a snapshot, restore or
// milestone taken next includes it
export async function flushOpenChapter(api, workId, editorState, chapterId) {
  if (editorState.chapterId !== chapterId || !editorState.hasUnsavedChanges) return;
  await api.put(`/works/${workId}/chapters/${chapterId}`, {
    content: editorState.content,
    contentHtml: editorState.html,
  });
}
```

`client/src/utils/api.js` — in the `api` object, after `put`:

```js
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix client test`
Expected: PASS — 49 tests (33 + 10 + 6).

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/polishDiff.js client/src/utils/historyDiff.js client/src/utils/versionHistory.js client/src/utils/api.js client/test/historyDiff.test.js client/test/versionHistory.test.js
git commit -m "feat: version comparison and history helpers for the client"
```

---

### Task 7: Chapter history modal

**Files:**
- Create: `client/src/components/overlays/VersionDiff.jsx`, `client/src/components/overlays/ChapterHistoryModal.jsx`
- Delete: `client/src/components/overlays/DraftHistoryModal.jsx`
- Modify: `client/src/components/editor/Toolbar.jsx` (import + render), `client/src/index.css` (replace the `Draft History Modal` block)
- Test: `npm --prefix client run build`; browser check

**Interfaces:**
- Consumes: Task 4 API; `buildHistoryDiff`, `collapseUnchanged`; `CURRENT`, `versionLabel`, `groupByDay`, `orderPair`, `flushOpenChapter`; `api.patch`; `useEditor()` (`state.content`, `state.html`, `state.chapterId`, `state.hasUnsavedChanges`, `replaceContent`).
- Produces: `<VersionDiff before after />` (used again in Task 8); `<ChapterHistoryModal workId chapterId onDismiss />`.

- [ ] **Step 1: Write `VersionDiff.jsx`**

```jsx
import { useMemo, useState } from 'react';
import { buildHistoryDiff, collapseUnchanged } from '../../utils/historyDiff.js';
import { formatNumber } from '../../utils/wordCount.js';

// Word-level comparison of two plain texts. Give it a `key` per pair so
// expanded stretches reset when the pair changes.
export default function VersionDiff({ before, after }) {
  const diff = useMemo(() => buildHistoryDiff(before || '', after || ''), [before, after]);
  const segments = useMemo(() => collapseUnchanged(diff.segments), [diff]);
  const [expanded, setExpanded] = useState(() => new Set());

  if (diff.segments.every((s) => s.type === 'equal')) {
    return <p className="version-diff-empty">No text changes (formatting changes aren't shown).</p>;
  }

  return (
    <div className="version-diff">
      <div className="version-diff-stats">
        <span className="version-diff-added">+{formatNumber(diff.added)} words</span>
        <span> · </span>
        <span className="version-diff-removed">−{formatNumber(diff.removed)} words</span>
        {diff.paragraphLevel && <span className="version-diff-note">Showing paragraph-level changes</span>}
      </div>
      <div className="version-diff-body">
        {segments.map((seg, i) => {
          if (seg.type === 'equal') return <span key={i}>{seg.text}</span>;
          if (seg.type === 'collapsed') {
            if (expanded.has(i)) return <span key={i}>{seg.text}</span>;
            return (
              <button
                key={i}
                className="version-diff-collapsed"
                onClick={() => setExpanded((prev) => new Set(prev).add(i))}
              >
                … {seg.paragraphs} unchanged paragraph{seg.paragraphs === 1 ? '' : 's'}
              </button>
            );
          }
          return (
            <span key={i} className="version-diff-change">
              {seg.parts.map((part, k) =>
                part.type === 'same' ? (
                  <span key={k}>{part.text}</span>
                ) : (
                  <span key={k} className={part.type === 'del' ? 'polish-del' : 'polish-add'}>{part.text}</span>
                )
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ChapterHistoryModal.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { countWords, formatNumber } from '../../utils/wordCount.js';
import { CURRENT, versionLabel, groupByDay, orderPair, flushOpenChapter } from '../../utils/versionHistory.js';
import VersionDiff from './VersionDiff.jsx';

const timeOfDay = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function ChapterHistoryModal({ workId, chapterId, onDismiss }) {
  const { state: editorState, replaceContent } = useEditor();
  const base = `/works/${workId}/chapters/${chapterId}/snapshots`;
  const [versions, setVersions] = useState(null);
  const [selectedId, setSelectedId] = useState(CURRENT);
  const [compareId, setCompareId] = useState(CURRENT);
  const [texts, setTexts] = useState({});
  const [view, setView] = useState('changes');
  const [naming, setNaming] = useState(null); // { mode: 'save' | 'keep' | 'rename', value }
  const [confirming, setConfirming] = useState(null); // 'restore' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const current = { id: CURRENT, kind: 'current', createdAt: null, wordCount: countWords(editorState.content || '') };
  const byId = (id) => (id === CURRENT ? current : versions?.find((v) => v.id === id));

  async function load(selectId) {
    const list = await api.get(base);
    setVersions(list);
    const sel = selectId && (selectId === CURRENT || list.some((v) => v.id === selectId)) ? selectId : list[0]?.id ?? CURRENT;
    setSelectedId(sel);
    setCompareId(sel === CURRENT ? list[0]?.id ?? CURRENT : CURRENT);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [workId, chapterId]);

  // Fetch the text of each version on screen, once
  useEffect(() => {
    for (const id of [selectedId, compareId]) {
      if (id === CURRENT || texts[id] !== undefined) continue;
      api
        .get(`${base}/${id}`)
        .then((s) => setTexts((prev) => ({ ...prev, [id]: s.content || '' })))
        .catch((err) => setError(err.message));
    }
  }, [selectedId, compareId]);

  const textOf = (id) => (id === CURRENT ? editorState.content || '' : texts[id]);

  function select(id) {
    setSelectedId(id);
    setNaming(null);
    setConfirming(null);
    if (id === compareId) setCompareId(id === CURRENT ? versions?.[0]?.id ?? CURRENT : CURRENT);
  }

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submitName = () =>
    run(async () => {
      const name = naming.value.trim();
      if (!name) return;
      if (naming.mode === 'save') {
        await flushOpenChapter(api, workId, editorState, chapterId);
        const saved = await api.post(base, { name });
        await load(saved.id);
      } else {
        await api.patch(`${base}/${selectedId}`, { name });
        await load(selectedId);
      }
      setNaming(null);
    });

  const restore = () =>
    run(async () => {
      await flushOpenChapter(api, workId, editorState, chapterId);
      const chapter = await api.post(`${base}/${selectedId}/restore`);
      replaceContent(chapter.content || '', chapter.contentHtml || '');
      onDismiss();
    });

  const remove = () =>
    run(async () => {
      await api.delete(`${base}/${selectedId}`);
      setConfirming(null);
      await load();
    });

  const selected = byId(selectedId) || current;
  const compare = byId(compareId) || current;
  const [older, newer] = orderPair(selected, compare);
  const olderText = textOf(older.id);
  const newerText = textOf(newer.id);
  const hasVersions = versions && versions.length > 0;

  let actions = null;
  if (naming) {
    actions = (
      <div className="history-actions">
        <input
          className="history-name-input"
          value={naming.value}
          maxLength={80}
          autoFocus
          placeholder="Name this version"
          onChange={(e) => setNaming({ ...naming, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName();
            if (e.key === 'Escape') setNaming(null);
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={submitName} disabled={busy || !naming.value.trim()}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>Cancel</button>
      </div>
    );
  } else if (confirming === 'restore') {
    actions = (
      <div className="history-actions history-confirm">
        <span>Restore this version? Your current text will be saved as a snapshot first.</span>
        <button className="btn btn-primary btn-sm" onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Restore'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  } else if (confirming === 'delete') {
    actions = (
      <div className="history-actions history-confirm">
        <span>Delete “{selected.name}”? This can't be undone.</span>
        <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  } else if (selectedId !== CURRENT) {
    actions = (
      <div className="history-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setConfirming('restore')} disabled={busy}>Restore this version</button>
        {selected.kind === 'auto' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'keep', value: '' })}>Keep this version…</button>
        )}
        {selected.kind === 'named' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'rename', value: selected.name })}>Rename…</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming('delete')}>Delete…</button>
          </>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="modal-backdrop draft-polish-backdrop" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="modal history-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Chapter History</h2>
            <p className="draft-polish-subtitle">
              Saved automatically while you write — every version from the last day, then one a day for a month, then one a week. Named versions are kept forever.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body history-body">
          {!versions && !error && <p className="panel-loading">Loading history…</p>}
          {versions && (
            <>
              <ul className="history-list">
                <li>
                  <button className={`history-item${selectedId === CURRENT ? ' active' : ''}`} onClick={() => select(CURRENT)}>
                    <span className="history-item-label">Current text</span>
                    <span className="history-item-meta">{formatNumber(current.wordCount)} words</span>
                  </button>
                </li>
                {groupByDay(versions).map((group) => (
                  <li key={group.label}>
                    <div className="history-day">{group.label}</div>
                    <ul className="history-sublist">
                      {group.items.map((v) => (
                        <li key={v.id}>
                          <button className={`history-item${selectedId === v.id ? ' active' : ''}`} onClick={() => select(v.id)}>
                            <span className={`history-item-label history-item-label--${v.kind}`}>{versionLabel(v)}</span>
                            <span className="history-item-meta">{timeOfDay(v.createdAt)} · {formatNumber(v.wordCount)} words</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <div className="history-main">
                {!hasVersions ? (
                  <p className="history-empty">No snapshots yet. They appear as you keep writing, or save one now.</p>
                ) : (
                  <>
                    <div className="history-compare-bar">
                      <label className="history-compare-label">
                        Compare with
                        <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
                          {selectedId !== CURRENT && <option value={CURRENT}>Current text</option>}
                          {versions.filter((v) => v.id !== selectedId).map((v) => (
                            <option key={v.id} value={v.id}>{versionLabel(v)} — {fullTime(v.createdAt)}</option>
                          ))}
                        </select>
                      </label>
                      <div className="history-view-toggle">
                        <button className={`btn btn-ghost btn-sm${view === 'changes' ? ' active' : ''}`} onClick={() => setView('changes')}>Changes</button>
                        <button className={`btn btn-ghost btn-sm${view === 'full' ? ' active' : ''}`} onClick={() => setView('full')}>Full text</button>
                      </div>
                    </div>
                    <div className="history-pane">
                      {view === 'full' ? (
                        textOf(selectedId) === undefined ? <p className="panel-loading">Loading…</p> : <pre className="history-fulltext">{textOf(selectedId) || '(empty)'}</pre>
                      ) : olderText === undefined || newerText === undefined ? (
                        <p className="panel-loading">Loading…</p>
                      ) : (
                        <VersionDiff key={`${older.id}:${newer.id}`} before={olderText} after={newerText} />
                      )}
                    </div>
                  </>
                )}
                {actions}
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setNaming({ mode: 'save', value: '' })} disabled={busy || !versions}>
            Save snapshot…
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

Note: when `selectedId === CURRENT` and `naming.mode === 'save'`, the `actions` block shows the name field; when a snapshot is selected, the footer's Save snapshot… still opens the same field in `save` mode.

- [ ] **Step 3: Wire into the toolbar and remove the old modal**

`client/src/components/editor/Toolbar.jsx`: replace `import DraftHistoryModal from '../overlays/DraftHistoryModal.jsx';` with `import ChapterHistoryModal from '../overlays/ChapterHistoryModal.jsx';`, and `<DraftHistoryModal` with `<ChapterHistoryModal` (same props). Change the button title to `"Compare, name and restore earlier versions of this chapter"`.

```bash
git rm client/src/components/overlays/DraftHistoryModal.jsx
```

- [ ] **Step 4: Styles**

In `client/src/index.css`, replace the whole `Draft History Modal` block (from its banner comment through the `@media (max-width: 640px) { .draft-history-body … }` rule) with:

```css
/* ============================================================
   Chapter History + Milestones
   ============================================================ */
.history-modal {
  width: min(1000px, 94vw);
  max-width: none;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.history-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 1rem;
  padding: 1rem 1.25rem;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.history-list,
.history-sublist {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-list {
  overflow-y: auto;
  border-right: 1px solid var(--border);
  padding-right: 0.75rem;
}

.history-day {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 0.75rem 0 0.25rem 0.6rem;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.45rem 0.6rem;
  color: var(--text);
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}
.history-item:hover { background: var(--bg-card); }
.history-item.active {
  border-color: var(--gold-dim);
  background: rgba(201, 169, 110, 0.08);
}
.history-item-label { font-size: 0.85rem; }
.history-item-label--named { color: var(--gold); }
.history-item-label--milestone { color: var(--purple); }
.history-item-meta { font-size: 0.75rem; color: var(--text-muted); }

.history-main {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  min-width: 0;
}

.history-compare-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.history-compare-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  min-width: 0;
}
.history-compare-label select {
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.4rem;
  max-width: 100%;
}
.history-view-toggle { display: flex; gap: 0.25rem; }
.history-view-toggle .active { color: var(--gold); border-color: var(--gold-dim); }

.history-pane {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-height: 58vh;
}

.history-fulltext {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.history-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.history-confirm span { font-size: 0.85rem; color: var(--text-muted); }
.history-name-input {
  flex: 1;
  min-width: 10rem;
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
}

.history-empty {
  color: var(--text-muted);
  font-style: italic;
}

.version-diff-stats {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
}
.version-diff-added { color: var(--teal); }
.version-diff-removed { color: var(--coral); }
.version-diff-note { margin-left: 0.75rem; font-style: italic; }

.version-diff-body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}
.version-diff-change {
  background: rgba(201, 169, 110, 0.07);
  border-radius: var(--radius-sm);
}
.version-diff-collapsed {
  display: block;
  margin: 0.25rem 0;
  background: none;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.version-diff-collapsed:hover { color: var(--text-muted); border-color: var(--text-dim); }
.version-diff-empty { color: var(--text-muted); font-style: italic; }

/* There was no destructive button style before this */
.btn-danger {
  background: rgba(224, 122, 122, 0.12);
  border: 1px solid rgba(224, 122, 122, 0.4);
  color: var(--error);
}
.btn-danger:hover:not(:disabled) { background: rgba(224, 122, 122, 0.2); }

@media (max-width: 640px) {
  .history-body { grid-template-columns: 1fr; overflow-y: auto; }
  .history-list { border-right: none; padding-right: 0; max-height: 30vh; }
}
```

- [ ] **Step 5: Build**

Run: `npm --prefix client run build > $SCRATCH/vh-build.log 2>&1; tail -5 $SCRATCH/vh-build.log`
Expected: `✓ built in …`, no errors. Also `npm --prefix client test` → 49 pass.

- [ ] **Step 6: Browser check**

With the throwaway server running, create `client/vite.verify.config.js` (deleted at the end of Task 8):

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5183, proxy: { '/api': 'http://localhost:3011' } },
});
```

Start it in the background from `client/`: `npx vite --config vite.verify.config.js > $SCRATCH/vh-vite.log 2>&1`.

With Playwright at `http://localhost:5183`:
1. Create a work and chapter, type "The cat sat on the mat. It rained all day.", wait 6 s (autosave). Change "cat" to "dog", wait 6 s. Open ⟲ History: the list shows "Current text" plus one Today/Autosave row; selecting it shows `+1 words · −1 words` with "cat" struck and "dog" highlighted.
2. Footer **Save snapshot…** → "First pass" → the row "★ First pass" appears and is selected.
3. Type a new sentence and **immediately** (within 5 s) open History → Save snapshot… "Fresh" → open "★ Fresh" in Full text: the new sentence is there (Review Focus 1).
4. Select the autosave row → **Keep this version…** "Kept" → it becomes "★ Kept". Rename it, then Delete… it.
5. Compare with: pick "★ First pass" against the autosave row → the older one is on the removed side.
6. Select "★ First pass" → **Restore this version** → confirm → modal closes, editor shows the restored text. Wait 7 s, reload the page: the chapter still shows the restored text (Review Focus 2). Reopen History: a "Before restore" row exists.
7. Paste a chapter with 30 short paragraphs, change one word in the middle, wait for autosave, change another → compare shows the change with "… N unchanged paragraphs" around it; clicking expands.
8. Make text bold only, wait for autosave twice → comparing those versions shows "No text changes (formatting changes aren't shown)."
9. Resize to 390 px width: list stacks above the comparison, no horizontal page scroll.

Expected: every step behaves as described. Fix code for any that doesn't (systematic debugging), with a unit test when the bug is in a pure helper.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/overlays/VersionDiff.jsx client/src/components/overlays/ChapterHistoryModal.jsx client/src/components/editor/Toolbar.jsx client/src/index.css
git commit -m "feat: chapter history with compare view, named snapshots and safe restore"
```

---

### Task 8: Milestones modal

**Files:**
- Create: `client/src/components/overlays/MilestonesModal.jsx`
- Modify: `client/src/pages/MainRoom.jsx` (sidebar header button + modal), `client/src/index.css` (append milestone styles)
- Test: build; browser check

**Interfaces:**
- Consumes: Task 5 API; Task 4 `GET …/snapshots/:id`; `VersionDiff`; `defaultMilestoneName`, `flushOpenChapter`; `useActiveWork().refreshChapters(workId)`; `useEditor()`.
- Produces: `<MilestonesModal workId onDismiss />`.

- [ ] **Step 1: Write `MilestonesModal.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { formatNumber } from '../../utils/wordCount.js';
import { defaultMilestoneName, flushOpenChapter } from '../../utils/versionHistory.js';
import VersionDiff from './VersionDiff.jsx';

const STATE_LABELS = { changed: 'Changed', unchanged: 'Unchanged', deleted: 'Deleted since', new: 'New since' };
const dateOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MilestonesModal({ workId, onDismiss }) {
  const { state: editorState, replaceContent } = useEditor();
  const { refreshChapters } = useActiveWork();
  const base = `/works/${workId}/milestones`;
  const [milestones, setMilestones] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [naming, setNaming] = useState(null); // { mode: 'new' | 'rename', value }
  const [confirming, setConfirming] = useState(null); // { type: 'restore', row } | { type: 'delete' }
  const [compare, setCompare] = useState(null); // { row, before, after }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function loadList(selectId) {
    const list = await api.get(base);
    setMilestones(list);
    setSelectedId(selectId && list.some((m) => m.id === selectId) ? selectId : list[0]?.id ?? null);
  }

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, [workId]);

  useEffect(() => {
    setDetail(null);
    setCompare(null);
    setConfirming(null);
    if (!selectedId) return;
    let live = true;
    api
      .get(`${base}/${selectedId}`)
      .then((d) => live && setDetail(d))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [selectedId]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submitName = () =>
    run(async () => {
      const name = naming.value.trim();
      if (!name) return;
      if (naming.mode === 'new') {
        await flushOpenChapter(api, workId, editorState, editorState.chapterId);
        const created = await api.post(base, { name });
        await loadList(created.id);
      } else {
        await api.patch(`${base}/${selectedId}`, { name });
        await loadList(selectedId);
      }
      setNaming(null);
    });

  const openCompare = (row) =>
    run(async () => {
      const [snapshot, now] = await Promise.all([
        api.get(`/works/${workId}/chapters/${row.chapterId}/snapshots/${row.snapshotId}`),
        row.chapterId === editorState.chapterId
          ? Promise.resolve({ content: editorState.content })
          : api.get(`/works/${workId}/chapters/${row.chapterId}`),
      ]);
      setCompare({ row, before: snapshot.content || '', after: now.content || '' });
    });

  const restore = (row) =>
    run(async () => {
      await flushOpenChapter(api, workId, editorState, row.chapterId);
      const { chapter } = await api.post(`${base}/${selectedId}/chapters/${row.chapterId}/restore`);
      if (chapter.id === editorState.chapterId) replaceContent(chapter.content || '', chapter.contentHtml || '');
      await refreshChapters(workId);
      setConfirming(null);
      setCompare(null);
      setDetail(await api.get(`${base}/${selectedId}`));
    });

  const removeMilestone = () =>
    run(async () => {
      await api.delete(`${base}/${selectedId}`);
      setConfirming(null);
      await loadList();
    });

  const selected = milestones?.find((m) => m.id === selectedId);

  let confirmBar = null;
  if (confirming?.type === 'restore') {
    const { row } = confirming;
    confirmBar = (
      <div className="history-actions history-confirm">
        <span>
          {row.state === 'deleted'
            ? `Bring back “${row.title}”? It will be added at the end of the chapter list.`
            : `Restore “${row.title}” to this milestone? Your current text will be saved as a snapshot first.`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => restore(row)} disabled={busy}>
          {row.state === 'deleted' ? 'Bring back' : 'Restore'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  } else if (confirming?.type === 'delete') {
    confirmBar = (
      <div className="history-actions history-confirm">
        <span>Delete the milestone “{selected?.name}”? Your chapters aren't affected.</span>
        <button className="btn btn-danger btn-sm" onClick={removeMilestone} disabled={busy}>Delete</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  }

  return createPortal(
    <div className="modal-backdrop draft-polish-backdrop" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="modal history-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Milestones</h2>
            <p className="draft-polish-subtitle">
              A milestone saves every chapter as it is now. Compare against it later, and restore any chapter on its own.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body history-body">
          {!milestones && !error && <p className="panel-loading">Loading milestones…</p>}
          {milestones && (
            <>
              <ul className="history-list">
                {milestones.length === 0 && <li className="history-empty">No milestones yet.</li>}
                {milestones.map((m) => (
                  <li key={m.id}>
                    <button
                      className={`history-item${selectedId === m.id ? ' active' : ''}`}
                      onClick={() => { setSelectedId(m.id); setNaming(null); }}
                    >
                      <span className="history-item-label history-item-label--milestone">◆ {m.name}</span>
                      <span className="history-item-meta">
                        {dateOf(m.createdAt)} · {m.chapterCount} chapter{m.chapterCount === 1 ? '' : 's'} · {formatNumber(m.wordCount)} words
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="history-main">
                {naming && (
                  <div className="history-actions">
                    <input
                      className="history-name-input"
                      value={naming.value}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitName();
                        if (e.key === 'Escape') setNaming(null);
                      }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={submitName} disabled={busy || !naming.value.trim()}>
                      {naming.mode === 'new' ? 'Create' : 'Save'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>Cancel</button>
                  </div>
                )}

                {!selectedId && !naming && (
                  <p className="history-empty">Create a milestone before a big revision, or when a draft is done.</p>
                )}

                {selectedId && compare && (
                  <>
                    <div className="history-compare-bar">
                      <button className="btn btn-ghost btn-sm" onClick={() => setCompare(null)}>← All chapters</button>
                      <span className="history-compare-label">“{compare.row.title}”: milestone → now</span>
                    </div>
                    <div className="history-pane">
                      <VersionDiff key={compare.row.chapterId} before={compare.before} after={compare.after} />
                    </div>
                  </>
                )}

                {selectedId && !compare && (
                  <div className="history-pane">
                    {!detail ? (
                      <p className="panel-loading">Comparing with today…</p>
                    ) : detail.chapters.length === 0 ? (
                      <p className="history-empty">This milestone has no chapters.</p>
                    ) : (
                      <table className="milestone-table">
                        <thead>
                          <tr><th>Chapter</th><th>State</th><th>Words</th><th>Changes</th><th /></tr>
                        </thead>
                        <tbody>
                          {detail.chapters.map((row) => (
                            <tr key={row.chapterId}>
                              <td>{row.title}</td>
                              <td><span className={`milestone-state milestone-state--${row.state}`}>{STATE_LABELS[row.state]}</span></td>
                              <td>{formatNumber(row.wordsThen)} → {formatNumber(row.wordsNow)}</td>
                              <td>
                                {row.state === 'unchanged' ? '—' : (
                                  <>
                                    <span className="version-diff-added">+{formatNumber(row.added)}</span>
                                    {' / '}
                                    <span className="version-diff-removed">−{formatNumber(row.removed)}</span>
                                  </>
                                )}
                              </td>
                              <td className="milestone-row-actions">
                                {row.state === 'changed' && (
                                  <>
                                    <button className="btn btn-ghost btn-sm" onClick={() => openCompare(row)} disabled={busy}>Compare</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming({ type: 'restore', row })} disabled={busy}>Restore chapter</button>
                                  </>
                                )}
                                {row.state === 'deleted' && (
                                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirming({ type: 'restore', row })} disabled={busy}>Bring back</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {confirmBar}

                {selectedId && !naming && !confirming && (
                  <div className="history-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'rename', value: selected?.name || '' })}>Rename…</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming({ type: 'delete' })}>Delete…</button>
                  </div>
                )}
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={() => setNaming({ mode: 'new', value: defaultMilestoneName() })}
            disabled={busy || !milestones}
          >
            New milestone…
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Wire into Main Room**

`client/src/pages/MainRoom.jsx`: add `import MilestonesModal from '../components/overlays/MilestonesModal.jsx';` and state `const [milestonesOpen, setMilestonesOpen] = useState(false);`. The header uses `justify-content: space-between`, so wrap its buttons: replace the `+` button in `.chapter-sidebar-header` with

```jsx
            <div className="chapter-sidebar-actions">
              <button
                className="chapter-add-btn"
                onClick={() => setMilestonesOpen(true)}
                title="Milestones — save and compare the whole book"
              >
                ◆
              </button>
              <button
                className="chapter-add-btn"
                onClick={() => setAddingChapter((v) => !v)}
                title="Add chapter"
              >
                +
              </button>
            </div>
```

and before the closing tag of `.main-room`:

```jsx
      {milestonesOpen && <MilestonesModal workId={workId} onDismiss={() => setMilestonesOpen(false)} />}
```


- [ ] **Step 3: Styles**

Append to the "Chapter History + Milestones" block in `client/src/index.css`:

```css
.chapter-sidebar-actions { display: flex; gap: 0.25rem; }

.milestone-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.milestone-table th {
  text-align: left;
  font-weight: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.milestone-table td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.milestone-row-actions { text-align: right; white-space: nowrap; }

.milestone-state {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  color: var(--text-muted);
}
.milestone-state--changed { color: var(--gold); border-color: var(--gold-dim); }
.milestone-state--new { color: var(--teal); border-color: rgba(93, 202, 165, 0.4); }
.milestone-state--deleted { color: var(--coral); border-color: rgba(216, 90, 48, 0.4); }

@media (max-width: 640px) {
  .milestone-table th:nth-child(3),
  .milestone-table td:nth-child(3) { display: none; }
  .milestone-row-actions { white-space: normal; }
}
```

- [ ] **Step 4: Build**

Run: `npm --prefix client run build > $SCRATCH/vh-build.log 2>&1; tail -5 $SCRATCH/vh-build.log`
Expected: built, no errors. `npm --prefix client test` → 49 pass.

- [ ] **Step 5: Browser check**

With the verify stack from Task 7:
1. A work with three chapters (one empty). ◆ → empty state → **New milestone…** shows `Milestone — <today en-GB>` → Create → selected, rows all Unchanged.
2. Type into the open chapter and within 5 s create a second milestone "Fresh" → its row for that chapter is Unchanged against today (the unsaved text was included — Review Focus 1).
3. Edit chapter 1, delete chapter 2, add chapter 4. Reopen ◆ on the first milestone → Changed / Deleted since / Unchanged / New since with word counts.
4. Compare on chapter 1 → diff shows the edit; ← All chapters returns.
5. Restore chapter on chapter 1 while it's open in the editor → confirm → editor shows the milestone text; row becomes Unchanged. Wait 7 s, reload: still restored.
6. Bring back chapter 2 → it appears at the end of the chapter sidebar; row becomes Unchanged.
7. Rename the milestone; Delete it (confirm) → list updates.
8. 390 px width: list stacks, table fits without horizontal page scroll.

Expected: all as described.

Then clean up the verify stack:

```bash
rm client/vite.verify.config.js
ps -eo pid,args | awk '$2=="node" && $3=="src/server.js"{print $1}' | xargs -r kill
docker stop scriptorium-verify-mongo
```

and stop the background Vite process.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/overlays/MilestonesModal.jsx client/src/pages/MainRoom.jsx client/src/index.css
git commit -m "feat: milestones — save the whole book, compare chapters, restore or bring back"
```
