# Full Work Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer downloads one zip with every item of one work, plus a versioned `manifest.json` that lists each entry with its size and SHA-256.

**Architecture:** `server/src/services/backupService.js` reads each collection through a Mongo cursor and yields archive entries. Each entry is hashed as it's written into an `archiver` zip, which is streamed straight into the HTTP response. The manifest is written last. A small `chapterMarkdown.js` converter produces the chapter `.md` files. The client adds a backup section to the existing `ExportModal`.

**Tech Stack:** Node 24 ESM, Express 4, Mongoose 8, `archiver` (new, runtime), `yauzl` (new, dev, test read-back), `htmlparser2` (existing), `node --test`, supertest, in-memory MongoDB, React 18 with the linkedom client harness.

**Spec:** `docs/superpowers/specs/2026-10-14-full-work-backup-design.md` (approved, commit 0786dad). Q-3 is decided there: ZIP of JSON files, `formatVersion` 1.

## Global Constraints

- Archive format: ZIP, `formatVersion` 1; `manifest.json` written last, with `bytes` and `sha256` for every other entry.
- Endpoint: `POST /api/works/:workId/backup`, behind `requireAuth` and `loadWork`. A non-owner gets 404.
- The archive never contains `Settings`, `DailyProgress`, `Session`, auth data or any AI key text.
- Response: `Content-Type: application/zip`, `X-Accel-Buffering: no`, no `Content-Length`.
- Every collection is read through a Mongo cursor. JSON arrays are streamed one record at a time.
- New dependencies: `archiver` (runtime) and `yauzl` (dev). `exportService.js` is not changed.
- Commits: Conventional Commits, summary ≤72 characters, body ends with `Trello: https://trello.com/c/pGlKhyOg`, then `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- Server tests run in WSL (`cd server && npm test`). The HTTP tests use in-memory mongod, which can't run in the Alpine container.

## Review Focus

The five inputs most likely to break a real writer's backup, most likely first. Each is pinned by the test named in its owning task.

1. A chapter with only legacy plain text and no `contentHtml` still gets its HTML and Markdown files, built from `content`. (Task 2: legacy chapter test)
2. A work with nothing else in it (no chapters, Codex, Map, catches, milestones or snapshots) still produces a valid archive: `codex.json` and `map.json` are `null`, the other lists are `[]`, and the manifest lists every entry. (Task 6: empty work test)
3. A title with quotes, slashes or non-Latin letters gives a safe filename, with an RFC 5987 `filename*`. (Task 6: unusual title test)
4. A client disconnect or read error in the middle of the archive closes the Mongo cursor and aborts the archive, with no hang and no unhandled rejection. (Task 5: disconnect test)
5. Records with optional fields missing (a snapshot without `threadIds`, a chapter without `scenes`) are exported as stored, without a crash. (Task 2: missing-fields test)

## Task Map

| Task | Delivers | Proves (acceptance) |
|---|---|---|
| 0. Spec and Q-3 decision (done, commit 0786dad) | S1 | n/a |
| 1. Chapter Markdown converter | S2 | A1 (chapter Markdown) |
| 2. Gather a work's records as entries | S2 | A1 |
| 3. Entry hashing and manifest builder | S3 | A2 |
| 4. Write the archive with manifest | S3 | A1, A2 |
| 5. Stream and abort on disconnect | S4 | A4 (automated part) |
| 6. Owner-only endpoint and HTTP tests | S3, S6 | A1, A2, A3, A5 |
| 7. Export modal backup section | S5 | A3 (UI shows owner-only action) |
| 8. Verification and A4 timed run | (none) | A4 (evidence), full suites |

S6 (Tests) is delivered by the test files in Tasks 1–7 and by the round-trip test in Task 6.

---

### Task 0: Spec and Q-3 decision (done)

**Delivers:** S1. The spec at commit 0786dad records the decision: ZIP of JSON files, `formatVersion` 1. No code.

---

### Task 1: Chapter Markdown converter

**Delivers:** S2 (chapter Markdown is one of the gathered chapter forms).

**Files:**
- Create: `server/src/services/chapterMarkdown.js`
- Test: `server/test/chapterMarkdown.test.js`

**Interfaces:**
- Consumes: `SCENE_BREAK` (`'* * *'`) from `server/src/services/exportService.js`.
- Produces: `chapterMarkdown(html: string): string`. Returns `''` for empty input, otherwise the Markdown followed by a single `\n`.

- [ ] **Step 0: Install dependencies in the worktree**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && npm install`
Expected: installs from the lockfile with no errors.

- [ ] **Step 1: Write the failing test**

Create `server/test/chapterMarkdown.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterMarkdown } from '../src/services/chapterMarkdown.js';

test('paragraphs are separated by a blank line', () => {
  assert.equal(chapterMarkdown('<p>One.</p><p>Two.</p>'), 'One.\n\nTwo.\n');
});

test('headings, emphasis and line breaks map to Markdown', () => {
  assert.equal(
    chapterMarkdown('<h1>Title</h1><p><b>Bold</b> and <em>soft</em><br>next</p>'),
    '# Title\n\n**Bold** and *soft*\\\nnext\n'
  );
});

test('underline keeps its text and drops the markup', () => {
  assert.equal(chapterMarkdown('<p><u>under</u>line</p>'), 'underline\n');
});

test('a scene marker becomes the scene break', () => {
  assert.equal(chapterMarkdown('<p>A</p><hr data-scene="s1"><p>B</p>'), 'A\n\n* * *\n\nB\n');
});

test('writer text that looks like Markdown is escaped', () => {
  assert.equal(chapterMarkdown('<p>*not bold* and # not heading</p>'), '\\*not bold\\* and # not heading\n');
  assert.equal(chapterMarkdown('<p># start</p>'), '\\# start\n');
  assert.equal(chapterMarkdown('<p>- item</p>'), '\\- item\n');
  assert.equal(chapterMarkdown('<p>1. first</p>'), '1\\. first\n');
});

test('entities are decoded and then escaped where needed', () => {
  assert.equal(chapterMarkdown('<p>Tom &amp; Jerry &lt;3</p>'), 'Tom & Jerry \\<3\n');
});

test('blockquotes prefix every line, including blank ones', () => {
  assert.equal(
    chapterMarkdown('<blockquote><p>Quoted</p><p>Second</p></blockquote>'),
    '> Quoted\n>\n> Second\n'
  );
});

test('a paragraph holding only a line break is skipped, and a trailing break is dropped', () => {
  assert.equal(chapterMarkdown('<p><br></p><p>Kept<br></p>'), 'Kept\n');
});

test('empty input gives an empty string', () => {
  assert.equal(chapterMarkdown(''), '');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/chapterMarkdown.test.js`
Expected: FAIL with `Cannot find module '.../chapterMarkdown.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `server/src/services/chapterMarkdown.js`:

```js
import { parseDocument } from 'htmlparser2';
import { SCENE_BREAK } from './exportService.js';

// Escape only what would turn writer text into Markdown
function escapeText(text) {
  return text
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .replace(/^(\s*)([#+-])/gm, '$1\\$2')
    .replace(/^(\s*\d+)\./gm, '$1\\.');
}

// Keep the spaces outside the marks, or the emphasis won't render
function emphasis(mark, text) {
  const [, lead, body, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return body ? `${lead}${mark}${body}${mark}${trail}` : text;
}

function inline(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeText(node.data);
      if (node.type !== 'tag') return '';
      if (node.name === 'br') return '\\\n';
      if (node.name === 'b' || node.name === 'strong') return emphasis('**', inline(node.children));
      if (node.name === 'i' || node.name === 'em') return emphasis('*', inline(node.children));
      return inline(node.children || []);
    })
    .join('');
}

// A paragraph holding only line breaks (an empty editor line) has nothing to write
function paragraph(text) {
  const trimmed = text.replace(/(\\\n)+$/, '').trim();
  return trimmed.replace(/\\\n/g, '').trim() ? [trimmed] : [];
}

function quote(parts) {
  return parts
    .join('\n\n')
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function blocks(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === 'text') {
      const text = escapeText(node.data.trim());
      return text ? [text] : [];
    }
    if (node.type !== 'tag') return [];
    if (node.name === 'hr') return [SCENE_BREAK];
    if (/^h[1-3]$/.test(node.name)) {
      const text = inline(node.children).trim();
      return text ? [`${'#'.repeat(Number(node.name[1]))} ${text}`] : [];
    }
    if (node.name === 'blockquote') return [quote(blocks(node.children))];
    if (node.name === 'p' || node.name === 'div') return paragraph(inline(node.children));
    return blocks(node.children || []);
  });
}

export function chapterMarkdown(html) {
  const body = blocks(parseDocument(html || '').children).join('\n\n');
  return body ? `${body}\n` : '';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/chapterMarkdown.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/src/services/chapterMarkdown.js server/test/chapterMarkdown.test.js
git commit -m "feat(backup): convert chapter HTML to Markdown" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Gather a work's records as archive entries

**Delivers:** S2 (gather all work data).

**Files:**
- Create: `server/src/services/backupService.js`
- Test: `server/test/backupEntries.test.js`

**Interfaces:**
- Consumes: `chapterMarkdown(html)` (Task 1); `chapterHtml({ content, contentHtml })` from `server/src/services/sceneMarkers.js`; the models `Work`, `Chapter`, `Codex`, `Map`, `Catch`, `PlotThread`, `Milestone`, `Snapshot`.
- Produces:
  - `toRecord(doc)`: `{ id, ...rest }`, with `_id` renamed to `id` and `__v` removed.
  - `workEntries(workId: string)`: an async generator of entries `{ path, kind, chapterId?, chunks, stats }`. `chunks` is an async iterable of strings. `stats.count` is complete once `chunks` has been consumed.

Entry order and kinds, for a work with one chapter: `work.json` (`work`), `chapters.json` (`chapters`), `scenes.json` (`scenes`), `chapters/<id>.html` (`chapter-html`), `chapters/<id>.md` (`chapter-markdown`), `codex.json` (`codex`), `map.json` (`map`), `catches.json` (`catches`), `threads.json` (`threads`), `milestones.json` (`milestones`), `snapshots.json` (`snapshots`).

- [ ] **Step 1: Write the failing test**

Create `server/test/backupEntries.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import { workEntries } from '../src/services/backupService.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import MapModel from '../src/models/Map.js';
import Catch from '../src/models/Catch.js';
import PlotThread from '../src/models/PlotThread.js';
import Milestone from '../src/models/Milestone.js';
import Snapshot from '../src/models/Snapshot.js';

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

async function collect(entry) {
  let text = '';
  for await (const chunk of entry.chunks) text += chunk;
  return text;
}

async function gather(workId) {
  const out = {};
  for await (const entry of workEntries(workId)) {
    const text = await collect(entry);
    out[entry.path] = { kind: entry.kind, chapterId: entry.chapterId, text, count: entry.stats.count };
  }
  return out;
}

async function seedFullWork() {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Work A', genre: 'Fantasy' });
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    threadIds: ['t1'],
    scenes: [{ id: 's1', title: 'Opening' }],
  });
  await Snapshot.create({
    _id: 'snap1',
    workId: 'work_a',
    chapterId: 'ch1',
    kind: 'named',
    name: 'Draft',
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  await Milestone.create({
    _id: 'ms1',
    workId: 'work_a',
    name: 'First',
    createdAt: '2026-10-01T00:00:00.000Z',
    chapters: [{ chapterId: 'ch1', title: 'One', order: 1, snapshotId: 'snap1', wordCount: 2 }],
  });
  await Codex.create({ _id: 'cx1', workId: 'work_a', characters: [{ name: 'Ada' }] });
  await MapModel.create({ _id: 'map1', workId: 'work_a', framework: 'three-act' });
  await Catch.create({ _id: 'c1', workId: 'work_a', content: 'An idea' });
  await PlotThread.create({ _id: 't1', workId: 'work_a', name: 'Heir', color: '#c9a96e' });
}

test('a full work yields every entry in archive order (A1)', async () => {
  await seedFullWork();
  const entries = await gather('work_a');
  assert.deepEqual(Object.keys(entries), [
    'work.json',
    'chapters.json',
    'scenes.json',
    'chapters/ch1.html',
    'chapters/ch1.md',
    'codex.json',
    'map.json',
    'catches.json',
    'threads.json',
    'milestones.json',
    'snapshots.json',
  ]);
  assert.equal(entries['chapters/ch1.html'].text, '<p>Hello <b>there</b></p>');
  assert.equal(entries['chapters/ch1.md'].text, 'Hello **there**\n');
  assert.equal(entries['chapters/ch1.md'].chapterId, 'ch1');
  assert.equal(entries['snapshots.json'].count, 1);
  assert.equal(entries['catches.json'].count, 1);
});

test('records use id in place of _id, and the owner is left out of work.json', async () => {
  await seedFullWork();
  const entries = await gather('work_a');
  const work = JSON.parse(entries['work.json'].text);
  assert.equal(work.id, 'work_a');
  assert.equal(work.title, 'Work A');
  assert.equal('ownerId' in work, false);
  assert.equal('_id' in work, false);
  assert.equal('__v' in JSON.parse(entries['snapshots.json'].text)[0], false);
});

test('a legacy chapter with only plain text still gets its HTML and Markdown (review focus 1)', async () => {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Legacy' });
  await Chapter.create({ _id: 'old', workId: 'work_a', title: 'Old', order: 1, content: 'Line one\n\nLine two' });
  const entries = await gather('work_a');
  assert.match(entries['chapters/old.html'].text, /Line one/);
  assert.match(entries['chapters/old.html'].text, /Line two/);
  assert.match(entries['chapters/old.md'].text, /Line one/);
  assert.match(entries['chapters/old.md'].text, /Line two/);
});

test('optional fields that are missing are exported as stored (review focus 5)', async () => {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Sparse' });
  await Chapter.create({ _id: 'ch1', workId: 'work_a', title: 'One', order: 1, contentHtml: '<p>Text</p>' });
  await Snapshot.create({
    _id: 'snap1',
    workId: 'work_a',
    chapterId: 'ch1',
    kind: 'auto',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  const entries = await gather('work_a');
  assert.deepEqual(JSON.parse(entries['scenes.json'].text), [{ chapterId: 'ch1', scenes: [] }]);
  const [snapshot] = JSON.parse(entries['snapshots.json'].text);
  assert.equal('threadIds' in snapshot, false);
  assert.equal(snapshot.chapterId, 'ch1');
});

test('a work with nothing else gives null for single documents and [] for lists (review focus 2)', async () => {
  await Work.create({ _id: 'work_empty', ownerId: 'user_a', title: 'Empty' });
  const entries = await gather('work_empty');
  assert.equal(entries['codex.json'].text, 'null');
  assert.equal(entries['codex.json'].count, 0);
  assert.equal(entries['map.json'].text, 'null');
  assert.equal(entries['chapters.json'].text, '[]');
  assert.equal(entries['snapshots.json'].count, 0);
  assert.equal(entries['work.json'].count, 1);
});

test('another work\'s records never leak into this work', async () => {
  await seedFullWork();
  await Work.create({ _id: 'work_b', ownerId: 'user_b', title: 'B' });
  await Catch.create({ _id: 'other', workId: 'work_b', content: 'Not yours' });
  const entries = await gather('work_a');
  assert.equal(entries['catches.json'].count, 1);
  assert.equal(entries['catches.json'].text.includes('Not yours'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupEntries.test.js`
Expected: FAIL with `workEntries is not a function` (or a missing-module error, since `backupService.js` does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `server/src/services/backupService.js`:

```js
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import Catch from '../models/Catch.js';
import PlotThread from '../models/PlotThread.js';
import Milestone from '../models/Milestone.js';
import Snapshot from '../models/Snapshot.js';
import { chapterHtml } from './sceneMarkers.js';
import { chapterMarkdown } from './chapterMarkdown.js';

// Same shape the API returns: `id` in place of `_id`, no `__v`
export function toRecord(doc) {
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export function workRecord(work) {
  const { ownerId, ...rest } = toRecord(work);
  return rest;
}

const CHAPTER_META = 'number title order status notes wordCount threadIds summary';

async function* textChunks(text) {
  yield text;
}

// Streams a JSON array one record at a time, so no full list is held in memory
async function* jsonArray(rows, stats) {
  yield '[';
  let first = true;
  for await (const row of rows) {
    yield (first ? '' : ',') + JSON.stringify(row);
    first = false;
    stats.count += 1;
  }
  yield ']';
}

async function* mapped(rows, fn) {
  for await (const row of rows) yield fn(row);
}

function arrayEntry(path, kind, rows) {
  const stats = { count: 0 };
  return { path, kind, chunks: jsonArray(rows, stats), stats };
}

function valueEntry(path, kind, value) {
  return { path, kind, chunks: textChunks(JSON.stringify(value ?? null)), stats: { count: value == null ? 0 : 1 } };
}

function textEntry(path, kind, chapterId, text) {
  return { path, kind, chapterId, chunks: textChunks(text), stats: { count: 1 } };
}

// Yields { path, kind, chapterId?, chunks, stats } in archive order
export async function* workEntries(workId) {
  const work = await Work.findById(workId).lean();
  yield valueEntry('work.json', 'work', workRecord(work));

  yield arrayEntry(
    'chapters.json',
    'chapters',
    mapped(Chapter.find({ workId }).sort({ order: 1 }).select(CHAPTER_META).lean().cursor(), toRecord)
  );
  yield arrayEntry(
    'scenes.json',
    'scenes',
    mapped(Chapter.find({ workId }).sort({ order: 1 }).select('scenes').lean().cursor(), (ch) => ({
      chapterId: String(ch._id),
      scenes: ch.scenes || [],
    }))
  );

  const chapterFiles = Chapter.find({ workId }).sort({ order: 1 }).select('content contentHtml').lean().cursor();
  for await (const ch of chapterFiles) {
    const chapterId = String(ch._id);
    const html = chapterHtml(ch);
    yield textEntry(`chapters/${chapterId}.html`, 'chapter-html', chapterId, html);
    yield textEntry(`chapters/${chapterId}.md`, 'chapter-markdown', chapterId, chapterMarkdown(html));
  }

  const codex = await Codex.findOne({ workId }).lean();
  yield valueEntry('codex.json', 'codex', codex && toRecord(codex));
  const map = await MapModel.findOne({ workId }).lean();
  yield valueEntry('map.json', 'map', map && toRecord(map));

  yield arrayEntry('catches.json', 'catches', mapped(Catch.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord));
  yield arrayEntry('threads.json', 'threads', mapped(PlotThread.find({ workId }).sort({ order: 1 }).lean().cursor(), toRecord));
  yield arrayEntry(
    'milestones.json',
    'milestones',
    mapped(Milestone.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord)
  );
  yield arrayEntry(
    'snapshots.json',
    'snapshots',
    mapped(Snapshot.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupEntries.test.js`
Expected: PASS, 6 tests. If the `Snapshot` or `Milestone` seed fails validation, check the required fields in the models (`createdAt`, `chapterId`, `kind`, `name`).

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/src/services/backupService.js server/test/backupEntries.test.js
git commit -m "feat(backup): gather a work's records as archive entries" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Entry hashing and manifest builder

**Delivers:** S3 (archive and manifest), the hashing and manifest half.

**Files:**
- Modify: `server/src/services/backupService.js`
- Test: `server/test/backupManifest.test.js`

**Interfaces:**
- Consumes: entries from `workEntries` (Task 2).
- Produces:
  - `FORMAT` (`'scriptorium-work-backup'`) and `FORMAT_VERSION` (`1`).
  - `measuring(onEnd)`: a Transform stream that passes bytes through unchanged. When it ends, it calls `onEnd({ bytes, sha256 })`.
  - `itemRecord(entry, { bytes, sha256 })`: `{ path, kind, chapterId?, count, bytes, sha256 }`.
  - `buildManifest({ work, items, exportedAt? })`: `{ format, formatVersion, exportedAt, work: { id, title }, items }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/backupManifest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { measuring, itemRecord, buildManifest, FORMAT, FORMAT_VERSION } from '../src/services/backupService.js';

test('measuring passes bytes through and reports the byte count and SHA-256', async () => {
  let seen = null;
  const stream = measuring((stats) => {
    seen = stats;
  });
  const out = [];
  stream.on('data', (chunk) => out.push(chunk));
  Readable.from([Buffer.from('a'), Buffer.from('bc')], { objectMode: false }).pipe(stream);
  await new Promise((resolve) => stream.on('end', resolve));
  assert.equal(Buffer.concat(out).toString(), 'abc');
  assert.equal(seen.bytes, 3);
  // Known SHA-256 of "abc"
  assert.equal(seen.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('itemRecord carries the entry path, kind, chapter id and count with the measured values', () => {
  const entry = { path: 'chapters/ch1.md', kind: 'chapter-markdown', chapterId: 'ch1', stats: { count: 1 } };
  assert.deepEqual(itemRecord(entry, { bytes: 9, sha256: 'abc' }), {
    path: 'chapters/ch1.md',
    kind: 'chapter-markdown',
    chapterId: 'ch1',
    count: 1,
    bytes: 9,
    sha256: 'abc',
  });
});

test('itemRecord leaves chapterId out for entries that are not per chapter', () => {
  const entry = { path: 'work.json', kind: 'work', stats: { count: 1 } };
  const record = itemRecord(entry, { bytes: 2, sha256: 'x' });
  assert.equal('chapterId' in record, false);
});

test('buildManifest names the format, the version, the work and its items (A2)', () => {
  const manifest = buildManifest({
    work: { _id: 'work_a', title: 'Work A' },
    items: [{ path: 'work.json', kind: 'work', count: 1, bytes: 2, sha256: 'x' }],
    exportedAt: '2026-10-14T12:00:00.000Z',
  });
  assert.deepEqual(manifest, {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: '2026-10-14T12:00:00.000Z',
    work: { id: 'work_a', title: 'Work A' },
    items: [{ path: 'work.json', kind: 'work', count: 1, bytes: 2, sha256: 'x' }],
  });
  assert.equal(FORMAT, 'scriptorium-work-backup');
  assert.equal(FORMAT_VERSION, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupManifest.test.js`
Expected: FAIL with `measuring is not a function` (or a similar missing-export error).

- [ ] **Step 3: Write the minimal implementation**

In `server/src/services/backupService.js`, add these imports at the top:

```js
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
```

Then append to the end of the file:

```js
export const FORMAT = 'scriptorium-work-backup';
export const FORMAT_VERSION = 1;

// Passes bytes through unchanged, counting and hashing them; onEnd gets the totals
export function measuring(onEnd) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  stream.on('end', () => onEnd({ bytes, sha256: hash.digest('hex') }));
  return stream;
}

export function itemRecord(entry, { bytes, sha256 }) {
  return {
    path: entry.path,
    kind: entry.kind,
    ...(entry.chapterId ? { chapterId: entry.chapterId } : {}),
    count: entry.stats.count,
    bytes,
    sha256,
  };
}

export function buildManifest({ work, items, exportedAt = new Date().toISOString() }) {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt,
    work: { id: String(work._id), title: work.title },
    items,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupManifest.test.js test/backupEntries.test.js`
Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/src/services/backupService.js server/test/backupManifest.test.js
git commit -m "feat(backup): hash archive entries and build the manifest" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Write the archive with its manifest

**Delivers:** S3 (archive and manifest), the zip writer.

**Files:**
- Modify: `server/src/services/backupService.js`
- Test: `server/test/backupWrite.test.js`

**Interfaces:**
- Consumes: `workEntries` (Task 2); `measuring`, `itemRecord`, `buildManifest` (Task 3).
- Produces: `writeWorkBackup(work, output, { entries? }) => Promise<items[]>`. `work` is the Work document (`_id` and `title` are read). `output` is a Writable. `entries` defaults to `workEntries` and exists so tests can supply their own. Resolves with the item records, after the archive is finalized.

- [ ] **Step 0: Install the dependencies**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && npm install archiver && npm install -D yauzl`
Expected: `archiver` appears under `dependencies` and `yauzl` under `devDependencies` in `server/package.json`.

- [ ] **Step 1: Write the failing test**

Create the shared zip reader `server/test/support/zip.js`:

```js
import yauzl from 'yauzl';

// Read every entry of a zip buffer back into a Map of name -> Buffer
export function unzip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const files = new Map();
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}
```

Create `server/test/backupWrite.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { writeWorkBackup, jsonArray } from '../src/services/backupService.js';
import { unzip } from './support/zip.js';

function bufferOutput() {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => out.on('end', () => resolve(Buffer.concat(chunks))));
  return { out, done };
}

function fakeEntries(texts) {
  return async function* entries() {
    for (const [path, kind, text] of texts) {
      yield { path, kind, chunks: (async function* () { yield text; })(), stats: { count: 1 } };
    }
  };
}

test('the archive holds each entry and a manifest that describes it (A2)', async () => {
  const { out, done } = bufferOutput();
  const work = { _id: 'work_a', title: 'Work A' };
  await writeWorkBackup(work, out, {
    entries: fakeEntries([
      ['work.json', 'work', '{"title":"Work A"}'],
      ['chapters/ch1.md', 'chapter-markdown', 'Hello\n'],
    ]),
  });
  const files = await unzip(await done);
  assert.deepEqual([...files.keys()], ['work.json', 'chapters/ch1.md', 'manifest.json']);

  const manifest = JSON.parse(files.get('manifest.json').toString());
  assert.equal(manifest.format, 'scriptorium-work-backup');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.work.id, 'work_a');
  assert.equal(manifest.items.length, 2);
  for (const item of manifest.items) {
    const content = files.get(item.path);
    assert.equal(item.bytes, content.length);
    assert.equal(item.sha256, createHash('sha256').update(content).digest('hex'));
    assert.equal(item.count, 1);
  }
  assert.equal(manifest.items.some((i) => i.path === 'manifest.json'), false);
});

test('jsonArray writes a valid JSON array, one record at a time', async () => {
  const stats = { count: 0 };
  async function* rows() {
    yield { id: 'a' };
    yield { id: 'b' };
  }
  let text = '';
  for await (const chunk of jsonArray(rows(), stats)) text += chunk;
  assert.deepEqual(JSON.parse(text), [{ id: 'a' }, { id: 'b' }]);
  assert.equal(stats.count, 2);
});
```

Note: `jsonArray` must be exported for this test. Export it in Task 4's implementation step (it is currently a private function).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupWrite.test.js`
Expected: FAIL with `writeWorkBackup is not a function`.

- [ ] **Step 3: Write the minimal implementation**

In `server/src/services/backupService.js`:

1. Change `async function* jsonArray(rows, stats)` to `export async function* jsonArray(rows, stats)`.
2. Add the import `import archiver from 'archiver';` at the top.
3. Add `import { Readable } from 'node:stream';` next to the `Transform` import.
4. Append:

```js
// Appends one entry, hashing it as it's written; resolves with its item record
function appendEntry(archive, entry, source) {
  return new Promise((resolve, reject) => {
    const measure = measuring((stats) => resolve(itemRecord(entry, stats)));
    source.on('error', reject);
    measure.on('error', reject);
    source.pipe(measure);
    archive.append(measure, { name: entry.path });
  });
}

export async function writeWorkBackup(work, output, { entries = workEntries } = {}) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(output);

  const items = [];
  for await (const entry of entries(String(work._id))) {
    const source = Readable.from(entry.chunks, { objectMode: false });
    items.push(await appendEntry(archive, entry, source));
  }

  archive.append(JSON.stringify(buildManifest({ work, items }), null, 2), { name: 'manifest.json' });
  await archive.finalize();
  return items;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupWrite.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/package.json server/package-lock.json server/src/services/backupService.js server/test/backupWrite.test.js server/test/support/zip.js
git commit -m "feat(backup): write the work archive with a manifest" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Stream and abort on disconnect

**Delivers:** S4 (large-work streaming). The automated part of A4.

**Files:**
- Modify: `server/src/services/backupService.js`
- Test: `server/test/backupStream.test.js`

**Interfaces:**
- Consumes: `writeWorkBackup` (Task 4). Changes its behaviour: bytes flow while entries are still being read, and it stops on disconnect or read error.
- Produces: unchanged signature. On failure or disconnect, it rejects, closes the in-flight source and aborts the archive.

- [ ] **Step 1: Write the failing test**

Create `server/test/backupStream.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { writeWorkBackup, jsonArray } from '../src/services/backupService.js';

// A "cursor" of big rows that records when each row is read and when it is closed
function fakeCursor(events, state) {
  return (async function* () {
    try {
      for (let i = 0; i < 4; i++) {
        events.push(`read ${i}`);
        yield { id: String(i), content: 'x'.repeat(100_000) };
      }
    } finally {
      state.closed = true;
    }
  })();
}

function entriesFrom(events, state) {
  return async function* () {
    const stats = { count: 0 };
    yield { path: 'snapshots.json', kind: 'snapshots', chunks: jsonArray(fakeCursor(events, state), stats), stats };
  };
}

test('bytes reach the output while later rows are still unread (A4 automated)', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.on('data', () => events.push('write'));
  await writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) });

  const firstWrite = events.indexOf('write');
  const lastRead = events.lastIndexOf('read 3');
  assert.ok(firstWrite >= 0, 'some bytes were written');
  assert.ok(firstWrite < lastRead, 'a write happened before the last row was read');
});

test('a client disconnect stops the reads, closes the cursor and rejects (review focus 4)', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.resume();
  const firstWrite = new Promise((resolve) => output.once('data', resolve));

  const run = writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) });
  await firstWrite;
  output.destroy();

  await assert.rejects(run);
  assert.equal(state.closed, true, 'the Mongo cursor was closed');
  assert.ok(!events.includes('read 3'), 'reading stopped before the last row');
});

test('a read error mid-archive rejects instead of hanging', async () => {
  const output = new PassThrough();
  output.resume();
  async function* failing() {
    yield { id: '0' };
    throw new Error('mongo went away');
  }
  const entries = async function* () {
    const stats = { count: 0 };
    yield { path: 'snapshots.json', kind: 'snapshots', chunks: jsonArray(failing(), stats), stats };
  };
  await assert.rejects(writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries }), /mongo went away/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupStream.test.js`
Expected: the streaming test passes already (Task 4 streams), but the disconnect test FAILS. It hangs or never rejects, and `state.closed` is `false`. The read-error test may pass, since Task 4 already rejects on source errors.

- [ ] **Step 3: Write the minimal implementation**

Replace `appendEntry` and `writeWorkBackup` in `server/src/services/backupService.js` with:

```js
// Appends one entry, hashing it as it's written; resolves with its item record
function appendEntry(archive, entry, source) {
  return new Promise((resolve, reject) => {
    const measure = measuring((stats) => resolve(itemRecord(entry, stats)));
    source.on('error', reject);
    measure.on('error', reject);
    source.pipe(measure);
    archive.append(measure, { name: entry.path });
  });
}

export async function writeWorkBackup(work, output, { entries = workEntries } = {}) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  let finished = false;

  // Client went away: stop reading and abort the archive
  output.once('close', () => {
    if (!finished) archive.abort();
  });

  // Rejects if the archive itself fails or is aborted, so no await can hang
  const failed = new Promise((_, reject) => {
    archive.once('error', reject);
    archive.once('abort', () => reject(new Error('backup aborted')));
  });
  failed.catch(() => {});

  archive.pipe(output);
  const items = [];
  let source = null;
  try {
    for await (const entry of entries(String(work._id))) {
      source = Readable.from(entry.chunks, { objectMode: false });
      items.push(await Promise.race([appendEntry(archive, entry, source), failed]));
      source = null;
    }
    archive.append(JSON.stringify(buildManifest({ work, items }), null, 2), { name: 'manifest.json' });
    await Promise.race([archive.finalize(), failed]);
    finished = true;
    return items;
  } catch (err) {
    source?.destroy();
    archive.abort();
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backupStream.test.js test/backupWrite.test.js test/backupManifest.test.js test/backupEntries.test.js test/chapterMarkdown.test.js`
Expected: PASS, all files. If the disconnect test still hangs, check that archiver emits `'abort'` on `abort()`. If it doesn't, listen to `output` `'close'` in `writeWorkBackup` and reject from there instead.

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/src/services/backupService.js server/test/backupStream.test.js
git commit -m "feat(backup): stream the archive and abort on disconnect" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Owner-only endpoint and HTTP tests

**Delivers:** S3 (the endpoint that serves the archive), S6 (the HTTP round-trip tests).

**Files:**
- Create: `server/src/routes/backup.js`
- Modify: `server/src/server.js` (mount the router next to the export route)
- Test: `server/test/backup.routes.test.js`

**Interfaces:**
- Consumes: `writeWorkBackup` (Task 5); `loadWork` (existing); `exportBasename` from `server/src/routes/export.js`.
- Produces: `POST /api/works/:workId/backup`, returning a zip. Errors before the first byte use the normal error handler. Errors after bytes are sent destroy the response.

- [ ] **Step 1: Write the failing test** (`yauzl` and the shared `unzip` helper are already in place from Task 4)

Create `server/test/backup.routes.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { startDb, clearDb } from './support/http.js';
import { unzip } from './support/zip.js';
import backupRouter from '../src/routes/backup.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import MapModel from '../src/models/Map.js';
import Catch from '../src/models/Catch.js';
import PlotThread from '../src/models/PlotThread.js';
import Milestone from '../src/models/Milestone.js';
import Snapshot from '../src/models/Snapshot.js';
import Settings from '../src/models/Settings.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: req.get('x-test-user') || 'user_a' };
  next();
});
app.use('/api/works/:workId/backup', backupRouter);
app.use(errorHandler);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const download = (workId, user = 'user_a') =>
  request(app).post(`/api/works/${workId}/backup`).set('x-test-user', user).buffer(true).parse(binary);

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

async function seedFullWork() {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Work A', genre: 'Fantasy' });
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    threadIds: ['t1'],
  });
  await Snapshot.create({
    _id: 'snap1',
    workId: 'work_a',
    chapterId: 'ch1',
    kind: 'named',
    name: 'Draft',
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  await Milestone.create({
    _id: 'ms1',
    workId: 'work_a',
    name: 'First',
    createdAt: '2026-10-01T00:00:00.000Z',
    chapters: [{ chapterId: 'ch1', title: 'One', order: 1, snapshotId: 'snap1', wordCount: 2 }],
  });
  await Codex.create({ _id: 'cx1', workId: 'work_a', characters: [{ name: 'Ada' }] });
  await MapModel.create({ _id: 'map1', workId: 'work_a', framework: 'three-act' });
  await Catch.create({ _id: 'c1', workId: 'work_a', content: 'An idea' });
  await PlotThread.create({ _id: 't1', workId: 'work_a', name: 'Heir', color: '#c9a96e' });
  await Settings.create({ _id: 'user_a', providers: { anthropic: { apiKey: 'sk-secret-123' } } });
}

test('the archive matches the work and every entry is listed with its hash (A1, A2, A5)', async () => {
  await seedFullWork();
  const res = await download('work_a');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/zip/);
  assert.equal(res.headers['x-accel-buffering'], 'no');
  assert.equal(res.headers['content-length'], undefined);

  const files = await unzip(res.body);
  for (const name of [
    'work.json',
    'chapters.json',
    'scenes.json',
    'chapters/ch1.html',
    'chapters/ch1.md',
    'codex.json',
    'map.json',
    'catches.json',
    'threads.json',
    'milestones.json',
    'snapshots.json',
    'manifest.json',
  ]) {
    assert.ok(files.has(name), `${name} is in the archive`);
  }

  assert.equal(JSON.parse(files.get('work.json')).title, 'Work A');
  assert.equal(files.get('chapters/ch1.html').toString(), '<p>Hello <b>there</b></p>');
  assert.equal(files.get('chapters/ch1.md').toString(), 'Hello **there**\n');
  assert.equal(JSON.parse(files.get('snapshots.json')).length, 1);

  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.items.length, files.size - 1);
  for (const item of manifest.items) {
    const content = files.get(item.path);
    assert.equal(item.bytes, content.length, `${item.path} bytes`);
    assert.equal(item.sha256, createHash('sha256').update(content).digest('hex'), `${item.path} sha256`);
  }
});

test('another writer gets 404 for this work (A3)', async () => {
  await seedFullWork();
  const res = await download('work_a', 'user_b');
  assert.equal(res.status, 404);
});

test('no AI key or provider settings appear anywhere in the archive (A3)', async () => {
  await seedFullWork();
  const res = await download('work_a');
  const files = await unzip(res.body);
  for (const [name, content] of files) {
    const text = content.toString();
    assert.equal(text.includes('sk-secret-123'), false, `${name} has no key`);
    assert.equal(text.includes('providers'), false, `${name} has no provider settings`);
  }
});

test('an empty work still produces a valid archive with a complete manifest (review focus 2)', async () => {
  await Work.create({ _id: 'work_empty', ownerId: 'user_a', title: 'Empty' });
  const res = await download('work_empty');
  assert.equal(res.status, 200);
  const files = await unzip(res.body);
  assert.equal(files.get('codex.json').toString(), 'null');
  assert.equal(files.get('map.json').toString(), 'null');
  assert.equal(files.get('chapters.json').toString(), '[]');
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.items.length, files.size - 1);
});

test('a title with quotes, slashes and non-Latin letters gives a safe filename (review focus 3)', async () => {
  await Work.create({ _id: 'work_odd', ownerId: 'user_a', title: 'He said "hi" / 漢字' });
  const res = await download('work_odd');
  const disposition = res.headers['content-disposition'];
  const plain = disposition.match(/filename="([^"]+)"/)[1];
  const encoded = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)[1]);
  assert.match(plain, /^[\x20-\x7e]*$/, 'plain filename is ASCII');
  assert.match(encoded, /^He-said-hi-漢字-backup-\d{4}-\d{2}-\d{2}\.zip$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backup.routes.test.js`
Expected: FAIL with `Cannot find module '.../routes/backup.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `server/src/routes/backup.js`:

```js
import { Router } from 'express';
import { loadWork } from '../middleware/loadWork.js';
import { writeWorkBackup } from '../services/backupService.js';
import { exportBasename } from './export.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// Same header scheme as the export route: ASCII fallback plus RFC 5987 filename*
function contentDisposition(filename) {
  const plain = filename.replace(/[^\x20-\x7e]|"/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// POST /api/works/:workId/backup
router.post('/', async (req, res, next) => {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${exportBasename(req.work.title)}-backup-${date}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    await writeWorkBackup(req.work, res);
  } catch (err) {
    // Nothing sent yet: the normal error response. Otherwise the zip is cut short
    if (!res.headersSent) return next(err);
    console.error('backup failed mid-stream', err);
    res.destroy(err);
  }
});

export default router;
```

Edit `server/src/server.js`:
- Add the import next to the export import: `import backupRouter from './routes/backup.js';`
- Add the mount next to the export mount: `app.use('/api/works/:workId/backup', auth, backupRouter);`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && node --test test/backup.routes.test.js`
Expected: PASS, 5 tests. If `res.headersSent` is false on a mid-stream error, Node has not sent headers yet because nothing was written. In that case `next(err)` returns a JSON 500, which is still correct.

- [ ] **Step 5: Run the full server suite**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && npm test`
Expected: all server tests pass, including the existing export and thread tests.

- [ ] **Step 6: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add server/src/routes/backup.js server/src/server.js server/test/backup.routes.test.js server/package.json server/package-lock.json
git commit -m "feat(backup): add the owner-only backup endpoint" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Export modal backup section

**Delivers:** S5 (download UI).

**Files:**
- Modify: `client/src/components/overlays/ExportModal.jsx`
- Test: `client/test/backupModal.test.js`

**Interfaces:**
- Consumes: `api.download(path, body, fallbackName)` from `client/src/utils/api.js` (existing; POSTs with a JSON body and returns `{ blob, filename }`).
- Produces: a "Full backup (.zip)" section in `ExportModal`. The button calls `POST /works/:workId/backup`.

- [ ] **Step 1: Write the failing test**

Before writing the test, read `client/test/support/app.js` and `client/test/support/render.js`, and find how another overlay test opens a context-driven modal. This test follows that pattern: it renders `ExportModal` with `exportModalOpen: true` and `exportWorkId: 'work_a'`.

Create `client/test/backupModal.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click } from './support/render.js';
import ExportModal from '../src/components/overlays/ExportModal.jsx';

const openExport = { exportModalOpen: true, exportWorkId: 'work_a' };

test('the modal offers a full backup alongside the manuscript export (A3)', async () => {
  const view = await renderApp(h(ExportModal), { ui: openExport });
  await flush();
  const text = view.container.textContent;
  assert.match(text, /Full backup \(\.zip\)/);
  assert.match(text, /complete copy of the work/);
  assert.match(text, /not a manuscript/);
  await view.unmount();
});

test('the backup button posts to the backup route and saves the file', async () => {
  const requests = [];
  const view = await renderApp(h(ExportModal), {
    ui: openExport,
    onRequest: (method, path) => requests.push(`${method} ${path}`),
    routes: { 'POST /works/work_a/backup': { binary: 'zip-bytes', filename: 'work-a-backup-2026-10-14.zip' } },
  });
  await flush();
  await click(view.container.querySelector('[data-testid="backup-button"]'));
  await flush();
  assert.deepEqual(requests, ['POST /works/work_a/backup']);
  await view.unmount();
});

test('a truncated download shows an error and saves nothing (review focus 4)', async () => {
  const saved = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return 'blob:x';
  };
  try {
    const view = await renderApp(h(ExportModal), {
      ui: openExport,
      routes: { 'POST /works/work_a/backup': { truncate: true } },
    });
    await flush();
    await click(view.container.querySelector('[data-testid="backup-button"]'));
    await flush();
    assert.match(view.container.textContent, /backup/i);
    assert.equal(saved.length, 0);
    await view.unmount();
  } finally {
    URL.createObjectURL = original;
  }
});
```

Note: the `routes` values (`binary`, `truncate`) and the `onRequest` option depend on what `renderApp` supports. If it doesn't support them, extend `client/test/support/app.js` in this same task. Keep the change small, and mention it in the commit body.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/client && npm install && node --import ./test/support/register.js --test test/backupModal.test.js`
Expected: FAIL, because the modal has no backup section yet (`Full backup (.zip)` not found).

- [ ] **Step 3: Write the minimal implementation**

Edit `client/src/components/overlays/ExportModal.jsx`:

1. Below the `FORMATS` constant, add a module-level helper (it replaces the download block inside `handleExport`):

```jsx
// Trigger the browser's save for a fetched file
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

2. In `handleExport`, replace the block from `// Trigger browser download` through `URL.revokeObjectURL(url);` with `saveFile(blob, filename);`.

3. Add state next to the existing state:

```jsx
const [backingUp, setBackingUp] = useState(false);
const [backupError, setBackupError] = useState(null);
```

4. In `handleClose`, also call `setBackupError(null);`.

5. Add the handler after `handleExport`:

```jsx
async function handleBackup() {
  if (!workId) return;
  setBackingUp(true);
  setBackupError(null);
  try {
    const { blob, filename } = await api.download(`/works/${workId}/backup`, {}, 'backup.zip');
    saveFile(blob, filename);
  } catch (err) {
    setBackupError(err.message);
  } finally {
    setBackingUp(false);
  }
}
```

6. In the JSX, after the Options `form-group` and before `{error && ...}`, add:

```jsx
<div className="form-group">
  <label className="form-label">Full backup</label>
  <p className="form-hint">
    A complete copy of this work: chapters as HTML and Markdown, history, milestones,
    plot threads, Codex and Map. It is not a manuscript.
  </p>
  <button
    className="btn btn-ghost"
    data-testid="backup-button"
    onClick={handleBackup}
    disabled={backingUp}
  >
    {backingUp ? 'Preparing backup…' : 'Full backup (.zip)'}
  </button>
  {backupError && <p className="form-error">{backupError}</p>}
</div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/client && node --import ./test/support/register.js --test test/backupModal.test.js`
Expected: PASS, 3 tests. Then run the whole client suite: `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /home/meor/workspace/scriptorium-pGlKhyOg
git add client/src/components/overlays/ExportModal.jsx client/test/backupModal.test.js client/test/support/app.js
git commit -m "feat(export): add a full backup option to the export modal" -m "Trello: https://trello.com/c/pGlKhyOg" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

If `client/test/support/app.js` didn't change, leave it out of the `git add`.

---

### Task 8: Verification and A4 timed run

**Delivers:** no subtask. This is verification and evidence.

**Files:**
- No committed files. A throwaway script goes in the session scratchpad, not the repo.

- [ ] **Step 1: Run both suites**

Run: `cd /home/meor/workspace/scriptorium-pGlKhyOg/server && npm test` and `cd ../client && npm test`
Expected: both pass. Paste the summary lines (pass and fail counts) into the card comment.

- [ ] **Step 2: Build a large work and time the download (A4)**

Write a throwaway script in the scratchpad that:
1. Starts `mongodb-memory-server` and connects mongoose using the real models.
2. Seeds one work owned by `user_a` with 60 chapters of about 2,500 words each (about 150k words in total), and 30 named snapshots per chapter (1,800 snapshots, each holding the full chapter HTML).
3. Starts an Express app with `backupRouter` on a random port, with the same user header shim as the route test.
4. Runs `curl -s -o backup.zip -w '%{time_starttransfer} %{time_total} %{size_download}' -X POST -H 'x-test-user: user_a' http://127.0.0.1:<port>/api/works/<id>/backup`.
5. Checks the archive with `unzip -l` and by reading `manifest.json`.

Expected: time to first byte under 2 s, total time under 100 s (the nginx and Cloudflare limit), and the manifest's entry count matching the zip's contents.

If the run is over 100 s, treat it as a finding. Record the timings and the bottleneck (likely the snapshot cursor or per-chapter HTML loads) before changing any code. Do not change code without the dev's OK.

- [ ] **Step 3: Record the evidence on the card**

Post one card comment with: the suite pass counts, the A4 timings (first byte, total, zip size), the manifest entry count, and the scratchpad script's path. Do not tick A4 until the dev has reviewed the numbers. This is part of pre-finalize, not Task 8.

---

## Acceptance Mapping

| Criterion | Proof |
|---|---|
| A1 archive contents | Task 2 gatherer test (every entry, kinds, order); Task 6 round-trip test (contents against the database) |
| A2 versioned machine-readable manifest | Task 3 manifest test; Task 4 archive-and-manifest test; Task 6 round-trip checks each item's bytes and SHA-256 |
| A3 owner only, no AI key | Task 6 404 test and no-key test; Task 7 modal test |
| A4 large work without timeout | Task 5 streaming test (automated); Task 8 timed run (evidence) |
| A5 tests check archive contents against the work | Task 6 round-trip test; Task 2 unit tests |

## Self-Review

- **Spec coverage:** Q-3 (Task 0). Gather (Task 2). Manifest (Task 3). Writer and streaming (Tasks 4–5). Endpoint and scoping (Task 6). Markdown (Task 1). UI (Task 7). Testing sections map to Tasks 1–8. Every spec section has a task.
- **Placeholders:** Task 7 Step 1 has one explicit "read first" step, because the exact `renderApp` options depend on the client test harness. That step is a real action with a stated fallback, not a placeholder.
- **Type consistency:** `workEntries` yields `{ path, kind, chapterId?, chunks, stats }` in Tasks 2, 4 and 5. `writeWorkBackup(work, output, { entries })` has the same signature in Tasks 4, 5 and 6. `itemRecord`, `measuring` and `buildManifest` match between Tasks 3 and 4. `jsonArray` is exported in Task 4 and used in Task 5.
- **Review focus:** each of the five inputs has a named test (Tasks 2, 5 and 6).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-14-full-work-backup.md`. Please review the plan. It has 8 tasks, plus the done spec task 0. Tasks 1 through 6 form a chain, since each builds on the last one's interfaces. Task 7 depends only on the endpoint's path.

For this plan I recommend **subagent-driven**, because the tasks depend on each other's interfaces and a shipped mistake here is data loss in the backup feature (G-2), which justifies a fresh reviewer per task. The alternative is native: cheaper and faster, with no independent review until the end.

Does the plan capture what you want, and which approach should we use?
