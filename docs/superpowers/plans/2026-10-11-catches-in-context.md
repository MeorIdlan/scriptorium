# Catches in Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catches tagged to a chapter surface while the writer is in it, can be edited, searched, reopened, inserted at the cursor or turned into a Codex entry / Map note, and feed the AI story context.

**Architecture:** The server hardens catch writes (a pure `catchFields.js` validator), untags catches when their chapter is deleted, and adds a "Writer's notes" section to the story context packet. The client gets pure helpers for grouping/search (`catchGroups.js`) and conversions (`catchActions.js`, composed from the existing Codex and Map endpoints), a remembered caret for inserting, a rewritten Catch tab, and badges on the tab label and chapter list.

**Tech Stack:** Express 4 + Mongoose 8 (ESM), React 18 + Vite 5, Node's built-in test runner (`node --test`), `linkedom` for client DOM tests.

**Spec:** `docs/superpowers/specs/2026-10-11-catches-in-context-design.md`

## Global Constraints

- Branch: `feat/catches-in-context`. Never push. Never commit to `main`.
- Server tests: `npm --prefix server test`. Client tests: `npm --prefix client test`. Both must stay green (baseline: server 68 pass, client 51 pass).
- Catch statuses: `open` | `used` | `discarded`. `usedAs.kind` ∈ `insert`, `codex-character`, `codex-place`, `codex-rule`, `map-note`.
- `content`: trimmed, 1–2,000 characters. `usedAs.refId` ≤ 100 chars, `usedAs.label` ≤ 120 chars.
- New catch ids: `catch_<Date.now()>_<8 hex>`. Old ids stay valid.
- Bad catch fields → HTTP 400, `code: 'INVALID_FIELD'`.
- Context packet: at most 10 open catches tagged to the current chapter, newest first, each collapsed to one line and clipped to 300 chars, under `## Writer's notes for this chapter`, after the Map section. Manifest key `catches`. Routes: hooks, rekindler, editor-review only.
- Copy: tab label `Catch · N`; group titles `For this chapter`, `Untagged`, `Ch. N — Title`; empty state `No open catches. Press Ctrl+Shift+I to capture an idea.`; no-match `Nothing matches “x”.`
- Insert: a new paragraph after the caret's paragraph, via `execCommand` so Ctrl+Z undoes it; falls back to the end of the chapter.
- Styling: plain CSS in `client/src/index.css`, existing theme variables (`--gold`, `--bg-card`, `--border`, `--text-muted`, …). Mobile breakpoint `@media (max-width: 640px)`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1
  ```

### Plan refinements of the spec (decided while planning)

1. **`catchUpdate` returns `{ ok, set }` only, no `unset`.** Reopening sets `usedAs: null` rather than removing the field, so every catch has the same shape. Same behaviour for the writer.
2. **The caret is not stored in `EditorContext`.** Recording a block offset means running `getBlocks` over the whole chapter on every `selectionchange`, which fires on every keystroke. Instead `editorBlocks.js` keeps a `WeakMap` from the editor root to the top-level node holding the caret (`rememberCaret` / `rememberedCaret`), and `blockEndPoint` turns it into an insert point only when Insert is pressed. The editor remounts per chapter, so a new root starts with no caret — the same reset the spec asked of `LOAD_CONTENT`. `blockOffsetToPoint` is not needed.
3. **The chapter-list dot sits at the right edge of the chapter row**, not inline after the title, because the title is ellipsis-clipped and an inline dot would be cut off.

## Review Focus

1. **Legacy data:** catches tagged to chapters deleted before this feature (dangling `taggedChapterId`) must show under "Untagged", not vanish or crash — `catchGroups` test in Task 4.
2. **Stale caret:** the remembered caret node was removed from the editor (paragraph deleted, content replaced by restore/Polish) — Insert must fall back to the end of the chapter, not throw — `blockEndPoint` test in Task 6.
3. **Map note on a chapter with no Map entry yet** (`mapData.chapters[id]` missing, or the Map document doesn't exist) — the note becomes the catch text with no leading blank lines — `catchActions` test in Task 5.
4. **Status-only updates on legacy catches longer than 2,000 characters** (or with odd content) must still succeed: validation applies only to fields present in the body — `catchFields` test in Task 1.
5. **Multi-line or whitespace-heavy catches in the context packet** must not break the bullet list — `contextBlock` test in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `server/src/services/catchFields.js` (new) | Pure validation of catch fields, id generation |
| `server/src/models/Catch.js` | Adds `usedAs` |
| `server/src/routes/catches.js` | Uses `catchFields`; checks chapter ownership |
| `server/src/routes/chapters.js` | Chapter delete untags catches |
| `server/src/services/contextBlock.js` | `catchesSection`, `formatContextBlock({ catches })` |
| `server/src/services/storyContextService.js` | `needs.catches` loads open tagged catches |
| `server/src/routes/ai.js` | hooks, rekindler, editor-review pass `catches: true` |
| `client/src/components/panel/ContextUsed.jsx` | Shows "N writer's note(s)" |
| `client/src/utils/catchGroups.js` (new) | Labels, filter/search, grouping, counts, `timeAgo`, `usedAsLabel` |
| `client/src/utils/catchActions.js` (new) | `markUsed`, `markDiscarded`, `reopen`, `useAsCodex`, `useAsMapNote`, `appendNote`, `defaultName` |
| `client/src/utils/editorBlocks.js` | `topLevelNode`, `rememberCaret`, `rememberedCaret`, `blockEndPoint`, `insertParagraphAfter` |
| `client/src/components/editor/Editor.jsx` | Records the caret |
| `client/src/components/panel/CatchRow.jsx` (new) | One catch: view / edit / use-as modes |
| `client/src/components/panel/CatchTab.jsx` | Search, filter, groups, action dispatch |
| `client/src/components/panel/RightPanel.jsx` | `Catch · N` label |
| `client/src/pages/MainRoom.jsx` | Chapter-list dots |
| `client/src/context/ActiveWorkContext.jsx` | `loadWork` also fetches catches |
| `client/src/components/overlays/CatchOverlay.jsx` | Uses `chapterLabel` |
| `client/src/index.css` | Catch tab, row, dot styles |
| `CLAUDE.md` | Lists `catchFields` |

## Verification stack (used by Tasks 2, 3, 7, 8)

Throwaway Mongo + API server with the fake LLM provider. `SCRATCH` = `/tmp/claude-1000/-home-meor-workspace-scriptorium/bb6b7696-65a0-4dee-a97a-d8800928bc9a/scratchpad`.

```bash
docker run -d --rm --name scriptorium-verify-mongo -p 27018:27017 docker.io/library/mongo:8   # skip if already running
sh $SCRATCH/vh-restart.sh    # (re)starts the server on :3011 with NODE_ENV=test, LLM_PROVIDER_OVERRIDE=fake, DEV_AUTH_BYPASS=true
```

Restart the server after every server-side change. Stop both at the end of Task 8:
`ps -eo pid,args | awk '$2=="node" && $3=="src/server.js"{print $1}' | xargs -r kill; docker stop scriptorium-verify-mongo`.

---

### Task 1: Catch field validation (server, pure)

**Files:**
- Create: `server/src/services/catchFields.js`
- Test: `server/test/catchFields.test.js`

**Interfaces:**
- Produces:
  - `MAX_CATCH_LENGTH = 2000`, `CATCH_STATUSES: string[]`, `USED_AS_KINDS: string[]`
  - `newCatchId(): string` — `catch_<ms>_<8hex>`
  - `catchContent(value): { ok: true, value: string } | { ok: false, field: 'content', message }`
  - `catchTag(value): { ok: true, value: string|null } | { ok: false, field: 'taggedChapterId', message }`
  - `catchUpdate(body): { ok: true, set: object } | { ok: false, field, message }`

- [ ] **Step 1: Write the failing test**

`server/test/catchFields.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CATCH_LENGTH,
  CATCH_STATUSES,
  USED_AS_KINDS,
  newCatchId,
  catchContent,
  catchTag,
  catchUpdate,
} from '../src/services/catchFields.js';

test('newCatchId has the catch_<ms>_<8hex> shape and is unique', () => {
  const a = newCatchId();
  const b = newCatchId();
  assert.match(a, /^catch_\d{13}_[0-9a-f]{8}$/);
  assert.notEqual(a, b);
});

test('constants match the spec', () => {
  assert.equal(MAX_CATCH_LENGTH, 2000);
  assert.deepEqual(CATCH_STATUSES, ['open', 'used', 'discarded']);
  assert.deepEqual(USED_AS_KINDS, ['insert', 'codex-character', 'codex-place', 'codex-rule', 'map-note']);
});

test('catchContent trims and enforces 1..2000 characters', () => {
  assert.deepEqual(catchContent('  idea  '), { ok: true, value: 'idea' });
  assert.equal(catchContent('x'.repeat(2000)).ok, true);
  assert.equal(catchContent('   ').ok, false);
  assert.equal(catchContent('x'.repeat(2001)).ok, false);
  assert.equal(catchContent(42).ok, false);
  assert.equal(catchContent(undefined).field, 'content');
});

test('catchTag accepts a short string, and treats null/empty/undefined as null', () => {
  assert.deepEqual(catchTag('ch_1'), { ok: true, value: 'ch_1' });
  assert.deepEqual(catchTag(null), { ok: true, value: null });
  assert.deepEqual(catchTag(''), { ok: true, value: null });
  assert.deepEqual(catchTag(undefined), { ok: true, value: null });
  assert.equal(catchTag(7).ok, false);
  assert.equal(catchTag({ $ne: null }).ok, false);
  assert.equal(catchTag('x'.repeat(101)).field, 'taggedChapterId');
});

test('catchUpdate keeps only whitelisted fields', () => {
  const r = catchUpdate({ content: ' new ', workId: 'w_other', createdAt: 'x', _id: 'y', id: 'z', extra: 1 });
  assert.deepEqual(r, { ok: true, set: { content: 'new' } });
});

test('catchUpdate validates only the fields present (status-only update on a long legacy catch)', () => {
  assert.deepEqual(catchUpdate({ status: 'discarded' }), { ok: true, set: { status: 'discarded' } });
  assert.deepEqual(catchUpdate({}), { ok: true, set: {} });
  assert.deepEqual(catchUpdate(null), { ok: true, set: {} });
});

test('catchUpdate rejects bad values with the field name', () => {
  assert.equal(catchUpdate({ content: '' }).field, 'content');
  assert.equal(catchUpdate({ status: 'archived' }).field, 'status');
  assert.equal(catchUpdate({ taggedChapterId: 5 }).field, 'taggedChapterId');
  assert.equal(catchUpdate({ usedAs: 'codex' }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'nope', refId: 'a', label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: '', label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: 'x'.repeat(101), label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: 'a', label: 'x'.repeat(121) } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: [] }).field, 'usedAs');
});

test('catchUpdate keeps a valid usedAs and drops its extra keys', () => {
  const r = catchUpdate({
    status: 'used',
    usedAs: { kind: 'codex-character', refId: 'char_1', label: 'Mara', evil: true },
  });
  assert.deepEqual(r, {
    ok: true,
    set: { status: 'used', usedAs: { kind: 'codex-character', refId: 'char_1', label: 'Mara' } },
  });
});

test('catchUpdate normalises an empty tag to null', () => {
  assert.deepEqual(catchUpdate({ taggedChapterId: '' }), { ok: true, set: { taggedChapterId: null } });
});

test('reopening always clears usedAs, whatever the body says', () => {
  assert.deepEqual(catchUpdate({ status: 'open' }), { ok: true, set: { status: 'open', usedAs: null } });
  assert.deepEqual(
    catchUpdate({ status: 'open', usedAs: { kind: 'insert', refId: 'c', label: 'Ch. 1' } }),
    { ok: true, set: { status: 'open', usedAs: null } }
  );
});

test('usedAs can be cleared explicitly', () => {
  assert.deepEqual(catchUpdate({ usedAs: null }), { ok: true, set: { usedAs: null } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '.../services/catchFields.js'`.

- [ ] **Step 3: Write the implementation**

`server/src/services/catchFields.js`:

```js
// Validation for catch writes. Pure, so routes stay thin and it can be tested
// without Mongo. Only the fields a client may change are ever returned.
import { randomBytes } from 'node:crypto';

export const MAX_CATCH_LENGTH = 2000;
export const CATCH_STATUSES = ['open', 'used', 'discarded'];
export const USED_AS_KINDS = ['insert', 'codex-character', 'codex-place', 'codex-rule', 'map-note'];
const MAX_REF_LENGTH = 100;
const MAX_LABEL_LENGTH = 120;

export const newCatchId = () => `catch_${Date.now()}_${randomBytes(4).toString('hex')}`;

const fail = (field, message) => ({ ok: false, field, message });

export function catchContent(value) {
  if (typeof value !== 'string') return fail('content', 'content must be text');
  const content = value.trim();
  if (!content) return fail('content', 'content is required');
  if (content.length > MAX_CATCH_LENGTH) {
    return fail('content', `content must be at most ${MAX_CATCH_LENGTH} characters`);
  }
  return { ok: true, value: content };
}

export function catchTag(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > MAX_REF_LENGTH) {
    return fail('taggedChapterId', 'taggedChapterId must be a chapter id or null');
  }
  return { ok: true, value };
}

function usedAsValue(value) {
  if (value === null) return { ok: true, value: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('usedAs', 'usedAs must be an object or null');
  }
  const { kind, refId, label } = value;
  if (!USED_AS_KINDS.includes(kind)) return fail('usedAs', 'usedAs.kind is not valid');
  if (typeof refId !== 'string' || !refId || refId.length > MAX_REF_LENGTH) {
    return fail('usedAs', 'usedAs.refId must be a short id');
  }
  if (typeof label !== 'string' || label.length > MAX_LABEL_LENGTH) {
    return fail('usedAs', 'usedAs.label must be short text');
  }
  return { ok: true, value: { kind, refId, label } };
}

export function catchUpdate(body) {
  const src = body && typeof body === 'object' ? body : {};
  const set = {};

  if ('content' in src) {
    const r = catchContent(src.content);
    if (!r.ok) return r;
    set.content = r.value;
  }
  if ('taggedChapterId' in src) {
    const r = catchTag(src.taggedChapterId);
    if (!r.ok) return r;
    set.taggedChapterId = r.value;
  }
  if ('status' in src) {
    if (!CATCH_STATUSES.includes(src.status)) return fail('status', 'status must be open, used or discarded');
    set.status = src.status;
  }
  if ('usedAs' in src) {
    const r = usedAsValue(src.usedAs);
    if (!r.ok) return r;
    set.usedAs = r.value;
  }
  // A reopened catch hasn't been used as anything
  if (set.status === 'open') set.usedAs = null;

  return { ok: true, set };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test 2>&1 | tail -8`
Expected: PASS — all tests, 68 + 11 = 79 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/catchFields.js server/test/catchFields.test.js
git commit -m "feat: validate catch fields with a whitelist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 2: Catch routes, model and chapter-delete untagging (server)

**Files:**
- Modify: `server/src/models/Catch.js`
- Modify: `server/src/routes/catches.js` (whole file)
- Modify: `server/src/routes/chapters.js` (imports; `DELETE /:chapterId` at ~line 216)
- Modify: `CLAUDE.md` (services list)
- Test: `$SCRATCH/cc-e2e-catches.mjs` (API E2E against the verification stack)

**Interfaces:**
- Consumes: `catchContent`, `catchTag`, `catchUpdate`, `newCatchId` from Task 1.
- Produces (HTTP):
  - `POST /api/works/:workId/catches { content, taggedChapterId?, capturedDuringChapterId? }` → 201 catch, or 400 `INVALID_FIELD`.
  - `PUT /api/works/:workId/catches/:catchId { content?, taggedChapterId?, status?, usedAs? }` → 200 catch, 400 `INVALID_FIELD`, 404.
  - Catch JSON: `{ id, workId, content, capturedDuringChapterId, taggedChapterId, status, usedAs, createdAt, updatedAt }` (`usedAs` absent on legacy catches → client treats as `null`).

- [ ] **Step 1: Write the failing E2E script**

`$SCRATCH/cc-e2e-catches.mjs`:

```js
// Catch API checks against the throwaway stack (server on :3011)
import { execFileSync } from 'node:child_process';

const B = 'http://localhost:3011/api';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  if (!ok) failures += 1;
};
async function j(method, path, body, retry = true) {
  // A keep-alive socket can go stale while a slow mongosh call runs; retry once
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .catch((err) => { if (retry && err.cause?.code === 'UND_ERR_SOCKET') return null; throw err; });
  if (!res) return j(method, path, body, false);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const mongo = (js) =>
  execFileSync('docker', ['exec', 'scriptorium-verify-mongo', 'mongosh', '--quiet', 'scriptorium_verify', '--eval', js]).toString().trim();

const W = (await j('POST', '/works', { title: 'Catches', genre: 'Drama' })).data.id;
const W2 = (await j('POST', '/works', { title: 'Other', genre: 'Drama' })).data.id;
const C1 = (await j('POST', `/works/${W}/chapters`, { title: 'One' })).data.id;
const C2 = (await j('POST', `/works/${W}/chapters`, { title: 'Two' })).data.id;
const X = (await j('POST', `/works/${W2}/chapters`, { title: 'Foreign' })).data.id;
const P = `/works/${W}/catches`;

// Create
let r = await j('POST', P, { content: '  She lies about the letter  ', taggedChapterId: C1, capturedDuringChapterId: C2 });
check('create trims and tags', r.status === 201 && r.data.content === 'She lies about the letter' && r.data.taggedChapterId === C1 && r.data.capturedDuringChapterId === C2 && r.data.status === 'open', JSON.stringify(r));
check('new id format', /^catch_\d{13}_[0-9a-f]{8}$/.test(r.data.id || ''), r.data.id);
check('usedAs starts null', r.data.usedAs === null, JSON.stringify(r.data));
const K = r.data.id;

r = await j('POST', P, { content: '   ' });
check('blank content → 400 INVALID_FIELD', r.status === 400 && r.data.code === 'INVALID_FIELD', JSON.stringify(r));
r = await j('POST', P, { content: 'x'.repeat(2001) });
check('over-long content → 400', r.status === 400, JSON.stringify(r).slice(0, 200));
r = await j('POST', P, { content: 'idea', taggedChapterId: X });
check("tag to another work's chapter → 400", r.status === 400 && r.data.code === 'INVALID_FIELD', JSON.stringify(r));
r = await j('POST', P, { content: 'idea', capturedDuringChapterId: X });
check("foreign capturedDuring is dropped", r.status === 201 && r.data.capturedDuringChapterId === null, JSON.stringify(r));
const Kforeign = r.data.id;

// Update whitelist
r = await j('PUT', `${P}/${K}`, { content: ' edited ', workId: W2, createdAt: '1999-01-01', extra: 'x' });
check('update applies whitelisted fields', r.status === 200 && r.data.content === 'edited', JSON.stringify(r));
check('update ignores workId/createdAt/extra', r.data.workId === W && r.data.createdAt !== '1999-01-01' && !('extra' in r.data), JSON.stringify(r.data));
r = await j('PUT', `${P}/${K}`, { status: 'archived' });
check('bad status → 400', r.status === 400 && r.data.code === 'INVALID_FIELD', JSON.stringify(r));
r = await j('PUT', `${P}/${K}`, { taggedChapterId: X });
check("retag to another work's chapter → 400", r.status === 400, JSON.stringify(r));
r = await j('PUT', `${P}/${K}`, { taggedChapterId: C2 });
check('retag to own chapter', r.status === 200 && r.data.taggedChapterId === C2, JSON.stringify(r));
r = await j('PUT', `${P}/${K}`, { status: 'used', usedAs: { kind: 'codex-character', refId: 'char_1', label: 'Mara', junk: 1 } });
check('mark used with usedAs', r.status === 200 && r.data.status === 'used' && JSON.stringify(r.data.usedAs) === JSON.stringify({ kind: 'codex-character', refId: 'char_1', label: 'Mara' }), JSON.stringify(r));
r = await j('PUT', `${P}/${K}`, { status: 'open' });
check('reopen clears usedAs', r.status === 200 && r.data.status === 'open' && r.data.usedAs === null, JSON.stringify(r));
r = await j('PUT', `${P}/catch_missing`, { status: 'used' });
check('unknown catch → 404', r.status === 404, JSON.stringify(r));
r = await j('PUT', `/works/${W2}/catches/${K}`, { status: 'used' });
check("catch from another work → 404", r.status === 404, JSON.stringify(r));

// Legacy catch: old id, no usedAs, over-long content — status-only update still works
const legacy = `catch_ab${String(Date.now()).slice(-3)}`;
mongo(`db.catches.insertOne({_id:'${legacy}', workId:'${W}', content:'${'y'.repeat(2500)}', taggedChapterId:'ch_gone', status:'open', createdAt:'2026-01-01T00:00:00.000Z'})`);
r = await j('PUT', `${P}/${legacy}`, { status: 'discarded' });
check('status-only update on long legacy catch', r.status === 200 && r.data.status === 'discarded', JSON.stringify(r).slice(0, 200));

// Chapter delete untags its catches
r = await j('PUT', `${P}/${K}`, { taggedChapterId: C2 });
r = await j('DELETE', `/works/${W}/chapters/${C2}`);
check('chapter delete ok', r.status === 204, JSON.stringify(r));
r = await j('GET', P);
const after = r.data.find((c) => c.id === K);
check('catch survives chapter delete, untagged', after && after.taggedChapterId === null, JSON.stringify(after));

// Cleanup
for (const id of [K, Kforeign, legacy]) await j('DELETE', `${P}/${id}`);
await j('DELETE', `/works/${W}`);
await j('DELETE', `/works/${W2}`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Start the verification stack (see "Verification stack"), then:
Run: `node $SCRATCH/cc-e2e-catches.mjs`
Expected: several FAIL lines — at least `new id format`, `usedAs starts null`, `blank content → 400 INVALID_FIELD`, `tag to another work's chapter → 400`, `update ignores workId/createdAt/extra`, `catch survives chapter delete, untagged`.

- [ ] **Step 3: Add `usedAs` to the model**

In `server/src/models/Catch.js`, after the `status` line:

```js
    status: { type: String, default: 'open' },
    usedAs: { type: mongoose.Schema.Types.Mixed, default: null }, // { kind, refId, label } once used
```

- [ ] **Step 4: Rewrite the routes**

`server/src/routes/catches.js`:

```js
import { Router } from 'express';
import CatchModel from '../models/Catch.js';
import Chapter from '../models/Chapter.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { catchContent, catchTag, catchUpdate, newCatchId } from '../services/catchFields.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

const invalid = (message) => httpError(400, 'INVALID_FIELD', message);

async function chapterOfWork(workId, chapterId) {
  return typeof chapterId === 'string' && Boolean(await Chapter.exists({ _id: chapterId, workId }));
}

// GET /api/works/:workId/catches
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

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

    const content = catchContent(req.body.content);
    if (!content.ok) return next(invalid(content.message));
    const tag = catchTag(req.body.taggedChapterId);
    if (!tag.ok) return next(invalid(tag.message));
    if (tag.value && !(await chapterOfWork(workId, tag.value))) {
      return next(invalid('taggedChapterId is not a chapter of this work'));
    }
    const during = (await chapterOfWork(workId, req.body.capturedDuringChapterId))
      ? req.body.capturedDuringChapterId
      : null;

    const now = new Date().toISOString();
    const catchItem = await CatchModel.create({
      _id: newCatchId(),
      workId,
      content: content.value,
      capturedDuringChapterId: during,
      taggedChapterId: tag.value,
      status: 'open',
      usedAs: null,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(catchItem);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/catches/:catchId — only content, tag, status and usedAs
router.put('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;

    const update = catchUpdate(req.body);
    if (!update.ok) return next(invalid(update.message));
    if (update.set.taggedChapterId && !(await chapterOfWork(workId, update.set.taggedChapterId))) {
      return next(invalid('taggedChapterId is not a chapter of this work'));
    }

    const updated = await CatchModel.findOneAndUpdate(
      { _id: catchId, workId },
      { $set: { ...update.set, updatedAt: new Date().toISOString() } },
      { new: true }
    );
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

- [ ] **Step 5: Untag catches on chapter delete**

In `server/src/routes/chapters.js`, add the import after `import Snapshot from '../models/Snapshot.js';`:

```js
import CatchModel from '../models/Catch.js';
```

and in `DELETE /:chapterId`, after the `Snapshot.deleteMany(...)` line:

```js
    // Catches tagged to the chapter stay, untagged
    await CatchModel.updateMany({ workId, taggedChapterId: chapterId }, { $set: { taggedChapterId: null } });
```

- [ ] **Step 6: Update CLAUDE.md**

In `CLAUDE.md`, change the services comment line

```
│       │                       #   snapshotService, snapshotMigration, textDiff (version history)
```

to

```
│       │                       #   snapshotService, snapshotMigration, textDiff (version history), catchFields
```

- [ ] **Step 7: Run the E2E script and the unit suite**

Run: `sh $SCRATCH/vh-restart.sh && node $SCRATCH/cc-e2e-catches.mjs && npm --prefix server test 2>&1 | tail -6`
Expected: every line `PASS`, then `ALL PASS`; server suite 79 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/Catch.js server/src/routes/catches.js server/src/routes/chapters.js CLAUDE.md
git commit -m "feat: whitelist catch updates, record what a catch became, untag on chapter delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 3: Catches in the story context packet

**Files:**
- Modify: `server/src/services/contextBlock.js` (new `catchesSection`; `formatContextBlock` signature)
- Modify: `server/src/services/storyContextService.js`
- Modify: `server/src/routes/ai.js` (hooks ~line 50, rekindler ~line 109, editor-review ~line 359)
- Modify: `client/src/components/panel/ContextUsed.jsx`
- Test: `server/test/contextBlock.test.js` (append)
- Test: `$SCRATCH/cc-e2e-context.mjs`

**Interfaces:**
- Consumes: Catch documents with `status`, `taggedChapterId`, `content`, `createdAt` (Task 2).
- Produces:
  - `MAX_CONTEXT_CATCHES = 10` (exported from `contextBlock.js`)
  - `formatContextBlock({ story, summaries, mentions, rules, mapBeat, catches })` → `{ text, codexNames, rules, catches: number }` — `catches` input is `string[]` (catch contents, newest first).
  - `buildContext(...)` with `needs.catches: true` → manifest gains `catches: number`.

- [ ] **Step 1: Write the failing unit tests**

Append to `server/test/contextBlock.test.js` (and add `MAX_CONTEXT_CATCHES` to its import list from `'../src/services/contextBlock.js'`):

```js
test('formatContextBlock renders writer notes after the Map section', () => {
  const out = formatContextBlock({
    story: { title: 'Bells' },
    summaries: [],
    mentions: [],
    rules: [],
    mapBeat: { act: 'Act I', beat: '', notes: '' },
    catches: ['She lies about the letter', 'Rain on the well'],
  });
  const t = out.text;
  assert.ok(t.includes("## Writer's notes for this chapter\n- She lies about the letter\n- Rain on the well"));
  assert.ok(t.indexOf('## This chapter on the Map') < t.indexOf("## Writer's notes for this chapter"));
  assert.equal(out.catches, 2);
});

test('writer notes are one line each, clipped to 300 characters, at most 10', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Note ${i}`);
  many[0] = 'Line one\n\n  line   two\tend';
  many[1] = 'x'.repeat(400);
  const out = formatContextBlock({ story: null, summaries: [], mentions: [], rules: [], mapBeat: null, catches: many });
  const lines = out.text.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(MAX_CONTEXT_CATCHES, 10);
  assert.equal(lines.length, 10);
  assert.equal(lines[0], '- Line one line two end');
  assert.equal(lines[1].length, 2 + 300);
  assert.ok(lines[1].endsWith('…'));
  assert.equal(out.catches, 10);
});

test('writer notes skip blank entries and add no section when none are left', () => {
  const out = formatContextBlock({ story: null, summaries: [], mentions: [], rules: [], mapBeat: null, catches: ['  ', '', null] });
  assert.equal(out.text, '');
  assert.equal(out.catches, 0);
  const none = formatContextBlock({ story: { title: 'T' }, summaries: [], mentions: [], rules: [], mapBeat: null });
  assert.ok(!none.text.includes("Writer's notes"));
  assert.equal(none.catches, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: 3 failures (the new tests; `MAX_CONTEXT_CATCHES` is undefined / no notes section).

- [ ] **Step 3: Implement the section**

In `server/src/services/contextBlock.js`, after `const CODEX_BUDGET = 8000;` add:

```js
const CATCH_MAX = 300;
export const MAX_CONTEXT_CATCHES = 10;
```

After `mapSection` add:

```js
// Open catches tagged to this chapter: ideas the writer meant to use here
function catchesSection(catches) {
  const lines = (catches || [])
    .map((c) => (typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_CONTEXT_CATCHES)
    .map((c) => `- ${clip(c, CATCH_MAX)}`);
  return {
    text: lines.length ? `## Writer's notes for this chapter\n${lines.join('\n')}` : '',
    count: lines.length,
  };
}
```

Replace `formatContextBlock` with:

```js
export function formatContextBlock({ story, summaries, mentions, rules, mapBeat, catches }) {
  const codex = codexSection(mentions, rules);
  const notes = catchesSection(catches);
  const sections = [storySection(story), summariesSection(summaries), codex.text, mapSection(mapBeat), notes.text].filter(Boolean);
  const text = sections.length ? `<story_context>\n${HEADER}\n\n${sections.join('\n\n')}\n</story_context>` : '';
  return { text, codexNames: codex.codexNames, rules: codex.rules, catches: notes.count };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test 2>&1 | tail -6`
Expected: 82 pass, 0 fail.

- [ ] **Step 5: Write the failing E2E script**

`$SCRATCH/cc-e2e-context.mjs`:

```js
// Context packet includes open catches tagged to the current chapter (fake provider)
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

const W = (await j('POST', '/works', { title: 'Ctx', genre: 'Drama' })).data.id;
const C1 = (await j('POST', `/works/${W}/chapters`, { title: 'One' })).data.id;
const C2 = (await j('POST', `/works/${W}/chapters`, { title: 'Two' })).data.id;
await j('PUT', `/works/${W}/chapters/${C1}`, { content: 'Mara walked to the well.', contentHtml: '<div>Mara walked to the well.</div>' });
const P = `/works/${W}/catches`;
await j('POST', P, { content: 'She lies about the letter', taggedChapterId: C1 });
await j('POST', P, { content: 'Rain on the well', taggedChapterId: C1 });
const used = (await j('POST', P, { content: 'Already used', taggedChapterId: C1 })).data.id;
await j('PUT', `${P}/${used}`, { status: 'used' });
await j('POST', P, { content: 'For chapter two', taggedChapterId: C2 });
await j('POST', P, { content: 'Untagged idea' });

let r = await j('POST', '/ai/hooks', { workId: W, chapterId: C1, content: 'Mara walked to the well.' });
check('hooks ok', r.status === 200 && Array.isArray(r.data.hooks), JSON.stringify(r).slice(0, 300));
check('hooks manifest counts 2 open catches for this chapter', r.data.context?.catches === 2, JSON.stringify(r.data.context));

r = await j('POST', '/ai/editor-review', { workId: W, chapterId: C1, content: 'Mara walked to the well.', mode: 'full' });
check('editor-review manifest counts catches', r.status === 200 && r.data.context?.catches === 2, JSON.stringify(r).slice(0, 300));

r = await j('POST', '/ai/rekindler', { workId: W });
check('rekindler manifest counts catches of the last-saved chapter', r.status === 200 && r.data.context?.catches === 2, JSON.stringify(r).slice(0, 300));

r = await j('POST', '/ai/polish-draft', { workId: W, chapterId: C1, targets: [{ id: 't1', text: 'Mara walked to the well.' }] });
check('polish-draft does not include catches', r.status === 200 && !r.data.context?.catches, JSON.stringify(r).slice(0, 300));

r = await j('POST', '/ai/hooks', { workId: W, chapterId: C2, content: '' });
check('chapter two gets its one catch', r.data.context?.catches === 1, JSON.stringify(r.data.context));

await j('DELETE', `/works/${W}`);
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 6: Run it to verify it fails**

Run: `sh $SCRATCH/vh-restart.sh && node $SCRATCH/cc-e2e-context.mjs`
Expected: FAIL on the `manifest counts` checks (`context.catches` undefined). `hooks ok` and the polish check PASS.

- [ ] **Step 7: Load catches in `buildContext`**

In `server/src/services/storyContextService.js`, add imports:

```js
import CatchModel from '../models/Catch.js';
import { findMentions, formatContextBlock, MAX_CONTEXT_CATCHES } from './contextBlock.js';
```

(replacing the existing `contextBlock.js` import). Add this helper above `buildContext`:

```js
// AI calls must never fail because of catches
async function openCatchesFor(workId, chapterId) {
  try {
    const rows = await CatchModel.find({ workId, taggedChapterId: chapterId, status: 'open' })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT_CATCHES)
      .select('content')
      .lean();
    return rows.map((r) => r.content);
  } catch (err) {
    console.error('Loading catches for context failed:', err);
    return [];
  }
}
```

Change the `Promise.all` to load catches too:

```js
  const [chapters, codex, map, catches] = await Promise.all([
    needChapters
      ? Chapter.find({ workId }).select('number title order content summary').sort({ order: 1 }).lean()
      : [],
    needs.codex ? Codex.findOne({ workId }).lean() : null,
    needs.mapBeat ? MapModel.findOne({ workId }).lean() : null,
    needs.catches && chapterId ? openCatchesFor(workId, chapterId) : [],
  ]);
```

Pass them to `formatContextBlock` and the manifest:

```js
  const { text, codexNames, rules, catches: catchCount } = formatContextBlock({
    story,
    summaries,
    mentions: needs.codex ? findMentions(codex, sourceText) : null,
    rules: needs.codex ? codex?.worldRules || [] : null,
    mapBeat,
    catches,
  });
```

and in the returned `manifest` object, after `beat: mapBeat?.beat || null,` add:

```js
      catches: catchCount,
```

- [ ] **Step 8: Turn it on for hooks, rekindler and editor-review**

In `server/src/routes/ai.js`:
- hooks (~line 50): `{ story: true, codex: true, summaries: 'before', mapBeat: true }` → `{ story: true, codex: true, summaries: 'before', mapBeat: true, catches: true }`
- rekindler (~line 109): `{ story: true, summaries: 'before', mapBeat: true }` → `{ story: true, summaries: 'before', mapBeat: true, catches: true }`
- editor-review (~line 359): `{ story: true, codex: true, summaries: 'before', mapBeat: true }` → `{ story: true, codex: true, summaries: 'before', mapBeat: true, catches: true }`

Leave polish-draft (~line 265) unchanged. Edit each call by its surrounding route, not by a global replace, because polish-draft has the same needs object.

- [ ] **Step 9: Show it in "Context used"**

In `client/src/components/panel/ContextUsed.jsx`, after the `if (context.beat) …` line:

```js
  if (context.catches) parts.push(plural(context.catches, "writer's note", "writer's notes"));
```

- [ ] **Step 10: Run E2E and both suites**

Run: `sh $SCRATCH/vh-restart.sh && node $SCRATCH/cc-e2e-context.mjs && node $SCRATCH/cc-e2e-catches.mjs | tail -1 && npm --prefix server test 2>&1 | tail -4 && npm --prefix client test 2>&1 | tail -4`
Expected: `ALL PASS` twice; server 82 pass; client 51 pass.

- [ ] **Step 11: Commit**

```bash
git add server/src/services/contextBlock.js server/src/services/storyContextService.js server/src/routes/ai.js server/test/contextBlock.test.js client/src/components/panel/ContextUsed.jsx
git commit -m "feat: open catches for the chapter go into the AI story context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 4: Catch grouping, search and labels (client, pure)

**Files:**
- Create: `client/src/utils/catchGroups.js`
- Test: `client/test/catchGroups.test.js`

**Interfaces:**
- Produces:
  - `chapterLabel(chapter): string` — `"Ch. 3 — The Well"`
  - `filterCatches(catches, { status = 'open', query = '', chapters = [] }): Catch[]`
  - `groupCatches(catches, chapters, currentChapterId): { key: string, title: string, items: Catch[] }[]`
  - `openCountsByChapter(catches): Map<string, number>`
  - `timeAgo(iso: string, now = Date.now()): string`
  - `usedAsLabel(usedAs): string`

- [ ] **Step 1: Write the failing test**

`client/test/catchGroups.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chapterLabel,
  filterCatches,
  groupCatches,
  openCountsByChapter,
  timeAgo,
  usedAsLabel,
} from '../src/utils/catchGroups.js';

const chapters = [
  { id: 'c2', number: 2, title: 'The Well', order: 1 },
  { id: 'c1', number: 1, title: 'Arrival', order: 0 },
  { id: 'c3', number: 3, title: '  ', order: 2 },
];
const k = (id, content, extra = {}) => ({ id, content, status: 'open', taggedChapterId: null, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

test('chapterLabel formats number and title, with Untitled for blank titles', () => {
  assert.equal(chapterLabel(chapters[0]), 'Ch. 2 — The Well');
  assert.equal(chapterLabel(chapters[2]), 'Ch. 3 — Untitled');
});

test('filterCatches filters by status, with all meaning every status', () => {
  const list = [k('a', 'one'), k('b', 'two', { status: 'used' }), k('c', 'three', { status: 'discarded' })];
  assert.deepEqual(filterCatches(list).map((c) => c.id), ['a']);
  assert.deepEqual(filterCatches(list, { status: 'used' }).map((c) => c.id), ['b']);
  assert.deepEqual(filterCatches(list, { status: 'all' }).map((c) => c.id), ['a', 'b', 'c']);
});

test('filterCatches searches text and tagged chapter title, case-insensitive and trimmed', () => {
  const list = [k('a', 'She LIES about the letter'), k('b', 'rain', { taggedChapterId: 'c2' }), k('c', 'other')];
  assert.deepEqual(filterCatches(list, { query: '  lies ', chapters }).map((c) => c.id), ['a']);
  assert.deepEqual(filterCatches(list, { query: 'well', chapters }).map((c) => c.id), ['b']);
  assert.deepEqual(filterCatches(list, { query: '   ', chapters }).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(filterCatches(list, { query: 'zzz', chapters }), []);
});

test('filterCatches tolerates missing content and a missing list', () => {
  assert.deepEqual(filterCatches(undefined), []);
  assert.deepEqual(filterCatches([{ id: 'x', status: 'open' }], { query: 'a' }), []);
});

test('groupCatches: this chapter, untagged, then other chapters in book order, newest first', () => {
  const list = [
    k('old-here', 'a', { taggedChapterId: 'c2', createdAt: '2026-10-01T00:00:00.000Z' }),
    k('new-here', 'b', { taggedChapterId: 'c2', createdAt: '2026-10-05T00:00:00.000Z' }),
    k('loose', 'c'),
    k('in-3', 'd', { taggedChapterId: 'c3' }),
    k('in-1', 'e', { taggedChapterId: 'c1' }),
  ];
  const groups = groupCatches(list, chapters, 'c2');
  assert.deepEqual(groups.map((g) => [g.key, g.title]), [
    ['this', 'For this chapter'],
    ['untagged', 'Untagged'],
    ['c1', 'Ch. 1 — Arrival'],
    ['c3', 'Ch. 3 — Untitled'],
  ]);
  assert.deepEqual(groups[0].items.map((c) => c.id), ['new-here', 'old-here']);
});

test('groupCatches puts tags to missing chapters under Untagged and omits empty groups', () => {
  const groups = groupCatches([k('ghost', 'x', { taggedChapterId: 'ch_gone' })], chapters, null);
  assert.deepEqual(groups.map((g) => g.key), ['untagged']);
  assert.deepEqual(groupCatches([], chapters, 'c1'), []);
});

test('openCountsByChapter counts only open, tagged catches', () => {
  const counts = openCountsByChapter([
    k('a', 'x', { taggedChapterId: 'c1' }),
    k('b', 'x', { taggedChapterId: 'c1' }),
    k('c', 'x', { taggedChapterId: 'c1', status: 'used' }),
    k('d', 'x'),
    k('e', 'x', { taggedChapterId: 'c2' }),
  ]);
  assert.equal(counts.get('c1'), 2);
  assert.equal(counts.get('c2'), 1);
  assert.equal(counts.has(null), false);
  assert.equal(openCountsByChapter(undefined).size, 0);
});

test('timeAgo buckets', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(20 * 1000), now), 'just now');
  assert.equal(timeAgo(ago(5 * 60 * 1000), now), '5 min ago');
  assert.equal(timeAgo(ago(3 * 3600 * 1000), now), '3 h ago');
  assert.equal(timeAgo(ago(2 * 86400 * 1000), now), '2 d ago');
  const old = timeAgo(ago(40 * 86400 * 1000), now);
  assert.ok(old && !old.includes('ago'), old);
  assert.equal(timeAgo('not a date', now), '');
  assert.equal(timeAgo(ago(-60 * 1000), now), 'just now');
});

test('usedAsLabel describes what the catch became', () => {
  assert.equal(usedAsLabel({ kind: 'insert', refId: 'c1', label: 'Ch. 1 — Arrival' }), 'Inserted in Ch. 1 — Arrival');
  assert.equal(usedAsLabel({ kind: 'codex-character', refId: 'x', label: 'Mara' }), 'Codex character: Mara');
  assert.equal(usedAsLabel({ kind: 'codex-place', refId: 'x', label: 'The Well' }), 'Codex place: The Well');
  assert.equal(usedAsLabel({ kind: 'codex-rule', refId: 'x', label: 'Bells bind' }), 'Codex rule: Bells bind');
  assert.equal(usedAsLabel({ kind: 'map-note', refId: 'c1', label: 'Ch. 1 — Arrival' }), 'Map note: Ch. 1 — Arrival');
  assert.equal(usedAsLabel(null), '');
  assert.equal(usedAsLabel(undefined), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix client test 2>&1 | tail -8`
Expected: FAIL — cannot find module `catchGroups.js`.

- [ ] **Step 3: Write the implementation**

`client/src/utils/catchGroups.js`:

```js
// Pure helpers for showing catches: labels, search, grouping and counts.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function chapterLabel(chapter) {
  const title = (chapter?.title || '').trim() || 'Untitled';
  return `Ch. ${chapter?.number ?? '?'} — ${title}`;
}

const newestFirst = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const bookOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.number ?? 0) - (b.number ?? 0);

export function filterCatches(catches, { status = 'open', query = '', chapters = [] } = {}) {
  const q = query.trim().toLowerCase();
  const titles = new Map(chapters.map((ch) => [ch.id, (ch.title || '').toLowerCase()]));
  return (catches || []).filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (!q) return true;
    return (c.content || '').toLowerCase().includes(q) || (titles.get(c.taggedChapterId) || '').includes(q);
  });
}

export function groupCatches(catches, chapters, currentChapterId) {
  const byId = new Map(chapters.map((ch) => [ch.id, ch]));
  const here = [];
  const untagged = [];
  const others = new Map();
  for (const c of [...catches].sort(newestFirst)) {
    const chapter = c.taggedChapterId ? byId.get(c.taggedChapterId) : null;
    if (!chapter) untagged.push(c);
    else if (chapter.id === currentChapterId) here.push(c);
    else {
      if (!others.has(chapter.id)) others.set(chapter.id, []);
      others.get(chapter.id).push(c);
    }
  }

  const groups = [];
  if (here.length) groups.push({ key: 'this', title: 'For this chapter', items: here });
  if (untagged.length) groups.push({ key: 'untagged', title: 'Untagged', items: untagged });
  for (const chapter of [...chapters].sort(bookOrder)) {
    if (others.has(chapter.id)) groups.push({ key: chapter.id, title: chapterLabel(chapter), items: others.get(chapter.id) });
  }
  return groups;
}

export function openCountsByChapter(catches) {
  const counts = new Map();
  for (const c of catches || []) {
    if (c.status !== 'open' || !c.taggedChapterId) continue;
    counts.set(c.taggedChapterId, (counts.get(c.taggedChapterId) || 0) + 1);
  }
  return counts;
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const age = Math.max(0, now - t);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (age < 30 * DAY) return `${Math.floor(age / DAY)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const USED_AS_PREFIX = {
  insert: 'Inserted in',
  'codex-character': 'Codex character:',
  'codex-place': 'Codex place:',
  'codex-rule': 'Codex rule:',
  'map-note': 'Map note:',
};

export function usedAsLabel(usedAs) {
  const prefix = usedAs && USED_AS_PREFIX[usedAs.kind];
  return prefix ? `${prefix} ${usedAs.label}` : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix client test 2>&1 | tail -6`
Expected: 51 + 9 = 60 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/catchGroups.js client/test/catchGroups.test.js
git commit -m "feat: catch grouping, search and labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 5: Catch actions — mark, reopen, Codex and Map conversions (client)

**Files:**
- Create: `client/src/utils/catchActions.js`
- Test: `client/test/catchActions.test.js`

**Interfaces:**
- Consumes: the `api` object shape from `client/src/utils/api.js` — `api.get(path)`, `api.post(path, body)`, `api.put(path, body)`, each returning a Promise of parsed JSON and rejecting with an `Error` on HTTP errors. Tests pass a fake.
- Produces:
  - `defaultName(text): string` — first non-blank line, trimmed, ≤ 60 chars
  - `appendNote(existing, text): string`
  - `markUsed(api, workId, catchItem, usedAs = null): Promise`
  - `markDiscarded(api, workId, catchItem): Promise`
  - `reopen(api, workId, catchItem): Promise`
  - `useAsCodex(api, workId, catchItem, { type: 'character'|'place'|'rule', name, text }): Promise<Result>`
  - `useAsMapNote(api, workId, catchItem, { chapterId, chapterLabel, text }): Promise<Result>`
  - `markUsedAfter(api, workId, catchItem, usedAs): Promise<Result>` — marks used, mapping a failure to `stage: 'mark'`
  - `Result = { ok: true } | { ok: false, stage: 'create' | 'mark', error: Error }`

- [ ] **Step 1: Write the failing test**

`client/test/catchActions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultName,
  appendNote,
  markUsed,
  markDiscarded,
  reopen,
  useAsCodex,
  useAsMapNote,
  markUsedAfter,
} from '../src/utils/catchActions.js';

// Records calls; `fail` maps a method to a predicate on the path; `map` is what GET /map returns
function fakeApi({ fail = {}, map = { chapters: {} } } = {}) {
  const calls = [];
  const handler = (method) => async (path, body) => {
    calls.push([method, path, body]);
    if (fail[method]?.(path)) throw new Error(`${method} ${path} failed`);
    if (method === 'get') return map;
    if (method === 'post') return { ...body, id: 'new_1' };
    return { ok: true };
  };
  return { calls, api: { get: handler('get'), post: handler('post'), put: handler('put') } };
}
const item = { id: 'k1', content: 'Mara\nhas a scar' };

test('defaultName takes the first non-blank line, trimmed, up to 60 characters', () => {
  assert.equal(defaultName('\n  Mara the bell-ringer  \nmore'), 'Mara the bell-ringer');
  assert.equal(defaultName('x'.repeat(80)).length, 60);
  assert.equal(defaultName(''), '');
  assert.equal(defaultName(undefined), '');
});

test('appendNote adds a blank line only when notes already exist', () => {
  assert.equal(appendNote('', 'New'), 'New');
  assert.equal(appendNote(undefined, 'New'), 'New');
  assert.equal(appendNote(null, 'New'), 'New');
  assert.equal(appendNote('Old\n\n', 'New'), 'Old\n\nNew');
  assert.equal(appendNote('Old', 'New'), 'Old\n\nNew');
});

test('markUsed, markDiscarded and reopen PUT the status', async () => {
  const { api, calls } = fakeApi();
  await markUsed(api, 'w1', item);
  await markUsed(api, 'w1', item, { kind: 'insert', refId: 'c1', label: 'Ch. 1' });
  await markDiscarded(api, 'w1', item);
  await reopen(api, 'w1', item);
  assert.deepEqual(calls, [
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: null }],
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: 'insert', refId: 'c1', label: 'Ch. 1' } }],
    ['put', '/works/w1/catches/k1', { status: 'discarded' }],
    ['put', '/works/w1/catches/k1', { status: 'open' }],
  ]);
});

test('useAsCodex creates each entry type, then marks the catch used', async () => {
  for (const [type, path, body] of [
    ['character', '/works/w1/codex/characters', { name: 'Mara', notes: 'text' }],
    ['place', '/works/w1/codex/places', { name: 'Mara', notes: 'text' }],
    ['rule', '/works/w1/codex/rules', { rule: 'Mara', description: 'text' }],
  ]) {
    const { api, calls } = fakeApi();
    const r = await useAsCodex(api, 'w1', item, { type, name: '  Mara ', text: 'text' });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(calls, [
      ['post', path, body],
      ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: `codex-${type}`, refId: 'new_1', label: 'Mara' } }],
    ]);
  }
});

test('useAsCodex: a failed create changes nothing else', async () => {
  const { api, calls } = fakeApi({ fail: { post: () => true } });
  const r = await useAsCodex(api, 'w1', item, { type: 'place', name: 'Well', text: 't' });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'create');
  assert.ok(r.error instanceof Error);
  assert.equal(calls.length, 1);
});

test('useAsCodex: a failed mark reports stage mark', async () => {
  const { api } = fakeApi({ fail: { put: () => true } });
  const r = await useAsCodex(api, 'w1', item, { type: 'character', name: 'Mara', text: 't' });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'mark');
});

test('useAsCodex rejects a blank name or unknown type without calling the api', async () => {
  const { api, calls } = fakeApi();
  assert.equal((await useAsCodex(api, 'w1', item, { type: 'character', name: '  ', text: 't' })).stage, 'create');
  assert.equal((await useAsCodex(api, 'w1', item, { type: 'monster', name: 'X', text: 't' })).stage, 'create');
  assert.equal(calls.length, 0);
});

test('useAsCodex clips the usedAs label to 120 characters', async () => {
  const { api, calls } = fakeApi();
  await useAsCodex(api, 'w1', item, { type: 'rule', name: 'r'.repeat(200), text: 't' });
  assert.equal(calls[1][2].usedAs.label.length, 120);
});

test('useAsMapNote appends to existing notes after re-reading the map', async () => {
  const { api, calls } = fakeApi({ map: { chapters: { c1: { notes: 'Old note' } } } });
  const r = await useAsMapNote(api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1 — Arrival', text: 'New idea' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, [
    ['get', '/works/w1/map', undefined],
    ['put', '/works/w1/map/chapters/c1', { notes: 'Old note\n\nNew idea' }],
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: 'map-note', refId: 'c1', label: 'Ch. 1 — Arrival' } }],
  ]);
});

test('useAsMapNote on a chapter with no Map entry, or no Map at all', async () => {
  for (const map of [{ chapters: {} }, {}, null]) {
    const { api, calls } = fakeApi({ map });
    await useAsMapNote(api, 'w1', item, { chapterId: 'c9', chapterLabel: 'Ch. 9', text: 'Only' });
    assert.deepEqual(calls[1], ['put', '/works/w1/map/chapters/c9', { notes: 'Only' }]);
  }
});

test('useAsMapNote failure stages', async () => {
  let f = fakeApi({ fail: { get: () => true } });
  let r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'create');
  assert.equal(f.calls.length, 1);

  f = fakeApi({ fail: { put: (p) => p.includes('/map/') } });
  r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'create');
  assert.equal(f.calls.length, 2);

  f = fakeApi({ fail: { put: (p) => p.includes('/catches/') } });
  r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'mark');
});

test('markUsedAfter maps a failure to stage mark', async () => {
  assert.deepEqual(await markUsedAfter(fakeApi().api, 'w1', item, null), { ok: true });
  const r = await markUsedAfter(fakeApi({ fail: { put: () => true } }).api, 'w1', item, null);
  assert.equal(r.stage, 'mark');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix client test 2>&1 | tail -8`
Expected: FAIL — cannot find module `catchActions.js`.

- [ ] **Step 3: Write the implementation**

`client/src/utils/catchActions.js`:

```js
// Catch actions built from existing endpoints. `api` is passed in so the
// order of calls and each failure point can be tested with a fake.
const MAX_NAME = 60;
const MAX_LABEL = 120;

const catchPath = (workId, catchItem) => `/works/${workId}/catches/${catchItem.id}`;

export function defaultName(text) {
  const line = (text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.slice(0, MAX_NAME).trim();
}

export function appendNote(existing, text) {
  const current = (existing || '').trimEnd();
  return current ? `${current}\n\n${text}` : text;
}

export const markUsed = (api, workId, catchItem, usedAs = null) =>
  api.put(catchPath(workId, catchItem), { status: 'used', usedAs });

export const markDiscarded = (api, workId, catchItem) => api.put(catchPath(workId, catchItem), { status: 'discarded' });

export const reopen = (api, workId, catchItem) => api.put(catchPath(workId, catchItem), { status: 'open' });

// The entry or text already exists by now, so a failure here leaves the catch open
export async function markUsedAfter(api, workId, catchItem, usedAs) {
  try {
    await markUsed(api, workId, catchItem, usedAs);
    return { ok: true };
  } catch (error) {
    return { ok: false, stage: 'mark', error };
  }
}

const CODEX_TARGETS = {
  character: { path: 'characters', body: (name, text) => ({ name, notes: text }) },
  place: { path: 'places', body: (name, text) => ({ name, notes: text }) },
  rule: { path: 'rules', body: (name, text) => ({ rule: name, description: text }) },
};

export async function useAsCodex(api, workId, catchItem, { type, name, text }) {
  const target = CODEX_TARGETS[type];
  const cleanName = (name || '').trim();
  if (!target) return { ok: false, stage: 'create', error: new Error(`Unknown Codex type: ${type}`) };
  if (!cleanName) return { ok: false, stage: 'create', error: new Error('A name is required') };

  let entry;
  try {
    entry = await api.post(`/works/${workId}/codex/${target.path}`, target.body(cleanName, text));
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
  return markUsedAfter(api, workId, catchItem, {
    kind: `codex-${type}`,
    refId: entry.id,
    label: cleanName.slice(0, MAX_LABEL),
  });
}

export async function useAsMapNote(api, workId, catchItem, { chapterId, chapterLabel, text }) {
  try {
    // Re-read so notes edited elsewhere since the page loaded aren't overwritten
    const map = await api.get(`/works/${workId}/map`);
    const notes = appendNote(map?.chapters?.[chapterId]?.notes, text);
    await api.put(`/works/${workId}/map/chapters/${chapterId}`, { notes });
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
  return markUsedAfter(api, workId, catchItem, {
    kind: 'map-note',
    refId: chapterId,
    label: chapterLabel.slice(0, MAX_LABEL),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix client test 2>&1 | tail -6`
Expected: 60 + 12 = 72 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/catchActions.js client/test/catchActions.test.js
git commit -m "feat: catch actions — mark, reopen, turn into a Codex entry or Map note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 6: Remembered caret and paragraph insert (client)

**Files:**
- Modify: `client/src/utils/editorBlocks.js` (append exports)
- Modify: `client/src/components/editor/Editor.jsx` (selectionchange handler)
- Test: `client/test/editorBlocks.test.js` (append)

**Interfaces:**
- Consumes: `getBlocks(root)` (existing).
- Produces:
  - `topLevelNode(root, node): Node | null` — the child of `root` that holds `node`
  - `rememberCaret(root, node)` / `rememberedCaret(root): Node | null` — per-editor-root memory (WeakMap)
  - `blockEndPoint(root, caretNode): { node, offset }` — end of the caret's block, else of the last block; `{ node: root, offset: 0 }` for an empty editor
  - `insertParagraphAfter(root, caretNode, text): boolean` — inserts `text` as new paragraph(s) after the caret's block using `execCommand` (browser only; not unit-tested)

- [ ] **Step 1: Write the failing tests**

Append to `client/test/editorBlocks.test.js` (add `topLevelNode, rememberCaret, rememberedCaret, blockEndPoint` to the existing import from `'../src/utils/editorBlocks.js'`):

```js
test('topLevelNode finds the child of the editor that holds a node', () => {
  const root = editor('Bare <b>bold</b><div>Two <i>it</i></div>');
  const italic = root.querySelector('i').firstChild;
  assert.equal(topLevelNode(root, italic), root.querySelector('div'));
  assert.equal(topLevelNode(root, root.querySelector('b').firstChild), root.querySelector('b'));
  assert.equal(topLevelNode(root, root), null);
  assert.equal(topLevelNode(root, editor('<div>x</div>').firstChild), null);
});

test('rememberedCaret is per editor root', () => {
  const a = editor('<div>A</div>');
  const b = editor('<div>B</div>');
  rememberCaret(a, a.firstChild);
  assert.equal(rememberedCaret(a), a.firstChild);
  assert.equal(rememberedCaret(b), null);
});

test('blockEndPoint is the end of the caret block for a <div> block', () => {
  const root = editor('<div>One</div><div>Two <b>x</b></div><div>Three</div>');
  const second = root.childNodes[1];
  assert.deepEqual(blockEndPoint(root, second), { node: second, offset: second.childNodes.length });
});

test('blockEndPoint is after the last node of a bare first-line run', () => {
  const root = editor('Bare <b>bold</b> tail<div>Two</div>');
  const bold = root.querySelector('b');
  // run = [text, b, text]; the point is in the root, after the run's third node
  assert.deepEqual(blockEndPoint(root, bold), { node: root, offset: 3 });
});

test('blockEndPoint falls back to the last block when the caret is unknown or gone', () => {
  const root = editor('<div>One</div><div>Two</div>');
  const last = root.childNodes[1];
  const expected = { node: last, offset: last.childNodes.length };
  assert.deepEqual(blockEndPoint(root, null), expected);
  const removed = root.childNodes[0];
  removed.remove();
  assert.deepEqual(blockEndPoint(root, removed), expected);
});

test('blockEndPoint for an empty editor is the start of the root', () => {
  const root = editor('');
  assert.deepEqual(blockEndPoint(root, null), { node: root, offset: 0 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix client test 2>&1 | tail -8`
Expected: FAIL — `topLevelNode` (etc.) is not a function / not exported.

- [ ] **Step 3: Implement the helpers**

Append to `client/src/utils/editorBlocks.js`:

```js
// ── Caret memory for inserting catches ──────────────────────────────────────
// Kept per editor root rather than in React state: the caret moves on every
// keystroke, and the editor remounts (a new root) for each chapter.
const caretByRoot = new WeakMap();

export function topLevelNode(root, node) {
  let current = node;
  while (current && current.parentNode !== root) current = current.parentNode;
  return current && current.parentNode === root ? current : null;
}

export function rememberCaret(root, node) {
  caretByRoot.set(root, node);
}

export function rememberedCaret(root) {
  return caretByRoot.get(root) || null;
}

// End of the block holding the caret node, or of the last block when the
// caret is unknown or its node has left the editor
export function blockEndPoint(root, caretNode) {
  const blocks = getBlocks(root);
  if (blocks.length === 0) return { node: root, offset: 0 };
  const block = (caretNode && blocks.find((b) => b.nodes.includes(caretNode))) || blocks[blocks.length - 1];
  const last = block.nodes[block.nodes.length - 1];
  if (block.nodes.length === 1 && isBlockElement(last)) return { node: last, offset: last.childNodes.length };
  return { node: root, offset: [...root.childNodes].indexOf(last) + 1 };
}

// Inserts text as new paragraph(s) after the caret's block. execCommand keeps
// it in the browser's undo history and fires `input`, so autosave sees it.
export function insertParagraphAfter(root, caretNode, text) {
  const doc = root.ownerDocument;
  const point = blockEndPoint(root, caretNode);
  root.focus();
  const range = doc.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const lines = text.split('\n');
  let inserted = false;
  if (root.textContent.trim() !== '' || root.querySelector('br')) inserted = doc.execCommand('insertParagraph');
  lines.forEach((line, i) => {
    if (i > 0) doc.execCommand('insertParagraph');
    if (line) inserted = doc.execCommand('insertText', false, line) || inserted;
  });
  return inserted;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix client test 2>&1 | tail -6`
Expected: 72 + 6 = 78 pass, 0 fail.

- [ ] **Step 5: Record the caret in the editor**

In `client/src/components/editor/Editor.jsx`, change the import:

```js
import { getBlocks, pointToBlockOffset, topLevelNode, rememberCaret } from '../../utils/editorBlocks.js';
```

and replace the body of `handleSelectionChange` from `const range = sel.getRangeAt(0);` to the end of the function with:

```js
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      // Remembered for inserting catches; cheap, so it runs on every caret move
      const end = range.endContainer;
      rememberCaret(
        root,
        end === root ? root.childNodes[Math.max(0, range.endOffset - 1)] || null : topLevelNode(root, end)
      );
      if (range.collapsed) {
        setSelection(null);
        return;
      }
      const blocks = getBlocks(root);
      const start = pointToBlockOffset(root, blocks, range.startContainer, range.startOffset);
      const stop = pointToBlockOffset(root, blocks, range.endContainer, range.endOffset);
      setSelection(start && stop ? { start, end: stop } : null);
```

- [ ] **Step 6: Run the client suite and build**

Run: `npm --prefix client test 2>&1 | tail -4 && npm --prefix client run build 2>&1 | tail -3`
Expected: 78 pass, 0 fail; build succeeds (`✓ built in …`).

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/editorBlocks.js client/src/components/editor/Editor.jsx client/test/editorBlocks.test.js
git commit -m "feat: remember the editor caret and insert a paragraph after it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

---

### Task 7: The Catch tab (client UI)

**Files:**
- Create: `client/src/components/panel/CatchRow.jsx`
- Modify: `client/src/components/panel/CatchTab.jsx` (rewrite)
- Modify: `client/src/index.css` (replace the "Catch Tab" block, ~lines 1256–1293)
- Test: browser walkthrough (Playwright) on the verification stack

**Interfaces:**
- Consumes: `chapterLabel`, `filterCatches`, `groupCatches`, `timeAgo`, `usedAsLabel` (Task 4); `defaultName`, `markUsed`, `markDiscarded`, `reopen`, `markUsedAfter`, `useAsCodex`, `useAsMapNote` (Task 5); `insertParagraphAfter`, `rememberedCaret` (Task 6); `useActiveWork()` → `{ state: { catches, chapters }, refreshCatches, refreshCodex, refreshMap }`; `useEditor()` → `{ state: { chapterId } }`.
- Produces: `CatchRow` props `{ item, chapters, showChapter: boolean, canInsert: boolean, defaultMapChapterId: string|null, onAction(kind, payload): Promise<Result> }`, where `kind` ∈ `edit`, `used`, `discard`, `reopen`, `insert`, `codex`, `map`.

- [ ] **Step 1: Write `CatchRow.jsx`**

```jsx
import { useState } from 'react';
import { chapterLabel, timeAgo, usedAsLabel } from '../../utils/catchGroups.js';
import { defaultName } from '../../utils/catchActions.js';

const USE_TARGETS = [
  { value: 'character', label: 'Codex character' },
  { value: 'place', label: 'Codex place' },
  { value: 'rule', label: 'Codex rule' },
  { value: 'map', label: 'Map note' },
];

function resultMessage(result) {
  if (result.ok) return '';
  if (result.stage === 'mark') return "Done, but couldn't mark the catch used. Press Used to mark it.";
  return result.error?.message || 'Something went wrong.';
}

export default function CatchRow({ item, chapters, showChapter, canInsert, defaultMapChapterId, onAction }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'use'
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [target, setTarget] = useState('character');
  const [name, setName] = useState('');
  const [mapChapterId, setMapChapterId] = useState('');

  const chapter = chapters.find((ch) => ch.id === item.taggedChapterId);
  const isOpen = item.status === 'open';

  async function act(kind, payload) {
    setBusy(true);
    setError('');
    const result = await onAction(kind, payload);
    setBusy(false);
    setError(resultMessage(result));
    if (result.ok || result.stage === 'mark') setMode('view');
  }

  function startEdit() {
    setDraft(item.content);
    setDraftTag(item.taggedChapterId || '');
    setError('');
    setMode('edit');
  }

  function startUse() {
    setTarget('character');
    setName(defaultName(item.content));
    setMapChapterId(item.taggedChapterId || defaultMapChapterId || chapters[0]?.id || '');
    setError('');
    setMode('use');
  }

  function saveEdit() {
    if (!draft.trim()) return;
    act('edit', { content: draft, taggedChapterId: draftTag || null });
  }

  function saveUse() {
    if (target === 'map') {
      const ch = chapters.find((c) => c.id === mapChapterId);
      if (!ch) return;
      act('map', { chapterId: ch.id, chapterLabel: chapterLabel(ch), text: item.content });
    } else {
      if (!name.trim()) return;
      act('codex', { type: target, name, text: item.content });
    }
  }

  if (mode === 'edit') {
    return (
      <div className="catch-row editing">
        <textarea
          className="form-textarea catch-edit-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === 'Escape') setMode('view');
          }}
          rows={3}
          autoFocus
          aria-label="Catch text"
        />
        <select className="form-select catch-edit-tag" value={draftTag} onChange={(e) => setDraftTag(e.target.value)} aria-label="Chapter">
          <option value="">No chapter</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>
          ))}
        </select>
        {error && <p className="catch-row-error">{error}</p>}
        <div className="catch-row-actions visible">
          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy || !draft.trim()}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode('view')} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="catch-row">
      <p
        className={`catch-row-text${expanded ? '' : ' clamped'}`}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse' : 'Show all'}
      >
        {item.content}
      </p>
      <div className="catch-row-meta">
        {showChapter && chapter && <span className="catch-row-chapter">{chapterLabel(chapter)}</span>}
        <span className="catch-row-age">{timeAgo(item.createdAt)}</span>
        {item.status === 'used' && <span className="catch-row-used">{usedAsLabel(item.usedAs) || 'Used'}</span>}
        {item.status === 'discarded' && <span className="catch-row-used">Discarded</span>}
      </div>

      {mode === 'use' && (
        <div className="catch-use">
          <select className="form-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Use as">
            {USE_TARGETS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {target === 'map' ? (
            <select className="form-select" value={mapChapterId} onChange={(e) => setMapChapterId(e.target.value)} aria-label="Map chapter">
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>
              ))}
            </select>
          ) : (
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Name"
              maxLength={120}
            />
          )}
          <div className="catch-row-actions visible">
            <button
              className="btn btn-primary btn-sm"
              onClick={saveUse}
              disabled={busy || (target === 'map' ? !mapChapterId : !name.trim())}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMode('view')} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="catch-row-error">{error}</p>}

      {mode === 'view' && (
        <div className="catch-row-actions">
          {isOpen ? (
            <>
              {canInsert && (
                <button className="btn btn-ghost btn-sm" onClick={() => act('insert')} disabled={busy} title="Insert as a new paragraph after the cursor">
                  Insert
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={startUse} disabled={busy}>Use as…</button>
              <button className="btn btn-ghost btn-sm" onClick={startEdit} disabled={busy}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => act('used')} disabled={busy}>Used</button>
              <button className="btn btn-ghost btn-sm danger" onClick={() => act('discard')} disabled={busy}>Discard</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => act('reopen')} disabled={busy}>Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `CatchTab.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { api } from '../../utils/api.js';
import { chapterLabel, filterCatches, groupCatches } from '../../utils/catchGroups.js';
import { markUsed, markDiscarded, reopen, markUsedAfter, useAsCodex, useAsMapNote } from '../../utils/catchActions.js';
import { insertParagraphAfter, rememberedCaret } from '../../utils/editorBlocks.js';
import CatchRow from './CatchRow.jsx';

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'used', label: 'Used' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'all', label: 'All' },
];

const EMPTY = {
  open: 'No open catches. Press Ctrl+Shift+I to capture an idea.',
  used: 'No used catches.',
  discarded: 'No discarded catches.',
  all: 'No catches yet. Press Ctrl+Shift+I to capture an idea.',
};

// Wraps a plain API call as an action result
async function attempt(fn) {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
}

export default function CatchTab({ workId }) {
  const { state, refreshCatches, refreshCodex, refreshMap } = useActiveWork();
  const { state: editorState } = useEditor();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');

  useEffect(() => {
    if (workId) refreshCatches(workId);
  }, [workId, refreshCatches]);

  const chapters = state.chapters || [];
  const currentChapter = chapters.find((ch) => ch.id === editorState.chapterId) || null;
  const visible = filterCatches(state.catches, { status, query, chapters });
  const groups = groupCatches(visible, chapters, editorState.chapterId);

  async function runAction(item, kind, payload) {
    let result;
    switch (kind) {
      case 'edit':
        result = await attempt(() => api.put(`/works/${workId}/catches/${item.id}`, payload));
        break;
      case 'used':
        result = await attempt(() => markUsed(api, workId, item));
        break;
      case 'discard':
        result = await attempt(() => markDiscarded(api, workId, item));
        break;
      case 'reopen':
        result = await attempt(() => reopen(api, workId, item));
        break;
      case 'insert': {
        const root = document.querySelector('.editor');
        if (!root || !currentChapter) {
          result = { ok: false, stage: 'create', error: new Error('Open a chapter to insert into.') };
          break;
        }
        insertParagraphAfter(root, rememberedCaret(root), item.content);
        result = await markUsedAfter(api, workId, item, {
          kind: 'insert',
          refId: currentChapter.id,
          label: chapterLabel(currentChapter),
        });
        break;
      }
      case 'codex':
        result = await useAsCodex(api, workId, item, payload);
        if (result.ok || result.stage === 'mark') refreshCodex(workId);
        break;
      case 'map':
        result = await useAsMapNote(api, workId, item, payload);
        if (result.ok || result.stage === 'mark') refreshMap(workId);
        break;
      default:
        result = { ok: false, stage: 'create', error: new Error(`Unknown action: ${kind}`) };
    }
    refreshCatches(workId);
    return result;
  }

  const trimmed = query.trim();

  return (
    <div className="catch-tab">
      <input
        className="form-input catch-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search catches"
        aria-label="Search catches"
      />
      <div className="catch-filter" role="group" aria-label="Show">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={`catch-filter-btn${status === s.value ? ' active' : ''}`}
            onClick={() => setStatus(s.value)}
            aria-pressed={status === s.value}
          >
            {s.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="catch-tab-empty">{trimmed ? `Nothing matches “${trimmed}”.` : EMPTY[status]}</p>
      )}

      {groups.map((group) => (
        <section key={group.key} className={`catch-group${group.key === 'this' ? ' current' : ''}`}>
          <p className="catch-tab-label">{group.title}</p>
          {group.items.map((item) => (
            <CatchRow
              key={item.id}
              item={item}
              chapters={chapters}
              showChapter={group.key !== 'this'}
              canInsert={Boolean(currentChapter)}
              defaultMapChapterId={editorState.chapterId}
              onAction={(kind, payload) => runAction(item, kind, payload)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
```

Note: `showChapter` is true in every group except `this`; inside a chapter group the label repeats the heading, which is fine and keeps a row self-describing when the group is long.

- [ ] **Step 3: Replace the Catch Tab CSS**

In `client/src/index.css`, replace everything from the `/* Catch Tab */` banner comment block through the end of the `.catch-row-actions { … }` rule (just before the `/* Map View */` banner) with:

```css
/* ============================================================
   Catch Tab
   ============================================================ */
.catch-tab {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.catch-search {
  width: 100%;
}

.catch-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.catch-filter-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.72rem;
  padding: 0.15rem 0.6rem;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
}
.catch-filter-btn:hover { color: var(--text); }
.catch-filter-btn.active {
  color: var(--gold);
  border-color: var(--gold-dim);
  background: rgba(201, 169, 110, 0.07);
}

.catch-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.catch-group.current .catch-tab-label { color: var(--gold-dim); }

.catch-row {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.65rem 0.75rem;
}
.catch-group.current .catch-row { border-color: rgba(201, 169, 110, 0.3); }

.catch-row-text {
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
  margin-bottom: 0.3rem;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  cursor: pointer;
}
.catch-row-text.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.catch-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.catch-row-chapter {
  display: inline-block;
  background: rgba(93, 202, 165, 0.1);
  color: var(--teal);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catch-row-used { color: var(--text-muted); }

.catch-row-error {
  font-size: 0.75rem;
  color: var(--error);
  margin-top: 0.35rem;
}

.catch-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
  opacity: 0;
  transition: opacity var(--transition);
}
.catch-row:hover .catch-row-actions,
.catch-row:focus-within .catch-row-actions,
.catch-row-actions.visible {
  opacity: 1;
}
@media (hover: none), (max-width: 640px) {
  .catch-row-actions { opacity: 1; }
}

.catch-row.editing,
.catch-use {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.catch-use { margin-top: 0.4rem; }
.catch-edit-text { width: 100%; resize: vertical; }
```

- [ ] **Step 4: Build and run the client suite**

Run: `npm --prefix client test 2>&1 | tail -4 && npm --prefix client run build 2>&1 | tail -3`
Expected: 78 pass, 0 fail; build succeeds.

- [ ] **Step 5: Browser walkthrough**

Start the verification stack and a Vite dev server pointed at it:

```bash
cat > client/vite.verify.config.js <<'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5183, proxy: { '/api': 'http://localhost:3011' } } });
EOF
(cd client && nohup npx vite --config vite.verify.config.js > $SCRATCH/cc-vite.log 2>&1 &)
```

Seed a work with two chapters (text in chapter 1) and catches via the API: two tagged to chapter 1, one tagged to chapter 2, one untagged, one used. Then with Playwright at `http://localhost:5183/work/<W>/chapter/<C1>` (click "Not now" on the Rekindler modal; save screenshots under `.playwright-mcp/`):

1. Catch tab: search box, filter (Open active), "For this chapter" (2, newest first), "Untagged", "Ch. 2 — …"; no raw ids.
2. Search "rain" → only matching rows; search "zzz" → `Nothing matches “zzz”.`
3. Edit a row → change text and retag to chapter 2 → Save → it moves to the chapter 2 group.
4. Click inside the first paragraph of the editor, then Insert on a catch → a new paragraph appears after that paragraph; the row leaves the Open view; filter Used shows "Inserted in Ch. 1 — …". Press Ctrl+Z in the editor → the inserted paragraph is removed. Wait 6 s, reload → the remaining text was autosaved.
5. Reload, do not click the editor, Insert another catch → it lands at the end of the chapter.
6. Use as… → Codex character, name prefilled from the first line → Save; Codex page lists the character with the catch text in notes. Repeat for place, rule.
7. Use as… → Map note for chapter 1 → Save; Map page, chapter 1 detail, Notes ends with the catch text (after a blank line if notes existed).
8. Used filter → Reopen a catch → it is back under Open with no "used as" line.
9. Resize to 390×844: actions visible without hover, no horizontal scroll in the panel.

Expected: each step behaves as described; browser console shows no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/panel/CatchRow.jsx client/src/components/panel/CatchTab.jsx client/src/index.css
git commit -m "feat: Catch tab — this chapter first, search, edit, insert, use as Codex entry or Map note, reopen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
```

(`client/vite.verify.config.js` is not committed; delete it at the end of Task 8.)

---

### Task 8: Badges, early catch loading and capture-overlay labels

**Files:**
- Modify: `client/src/context/ActiveWorkContext.jsx` (`loadWork`)
- Modify: `client/src/components/panel/RightPanel.jsx`
- Modify: `client/src/pages/MainRoom.jsx` (chapter list)
- Modify: `client/src/components/overlays/CatchOverlay.jsx` (chapter select)
- Modify: `client/src/index.css` (chapter-item dot)
- Test: browser walkthrough

**Interfaces:**
- Consumes: `openCountsByChapter`, `chapterLabel` (Task 4).

- [ ] **Step 1: Load catches with the work**

In `client/src/context/ActiveWorkContext.jsx`, in `loadWork`, right after `dispatch({ type: 'SET_CHAPTERS', chapters });`:

```js
      // Badges need catches before the Catch tab is opened; failure here is not fatal
      api
        .get(`/works/${workId}/catches`)
        .then((catches) => dispatch({ type: 'SET_CATCHES', catches }))
        .catch((err) => console.error('Failed to load catches:', err));
```

- [ ] **Step 2: Tab label count**

In `client/src/components/panel/RightPanel.jsx` add imports:

```js
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { openCountsByChapter } from '../../utils/catchGroups.js';
```

Inside the component, after `const { activePanelTab } = state;`:

```js
  const { state: workState } = useActiveWork();
  const { state: editorState } = useEditor();
  const catchCount = openCountsByChapter(workState.catches).get(editorState.chapterId) || 0;
```

Change the `useLayoutEffect` dependency array from `[activePanelTab]` to `[activePanelTab, catchCount]` (the label width changes with the count), and render the label:

```jsx
            {tab.id === 'catch' && catchCount > 0 ? `${tab.label} · ${catchCount}` : tab.label}
```

in place of `{tab.label}`. Add `title` to the button: `title={tab.id === 'catch' && catchCount > 0 ? `${catchCount} open catch${catchCount === 1 ? '' : 'es'} for this chapter` : undefined}`.

- [ ] **Step 3: Chapter-list dots**

In `client/src/pages/MainRoom.jsx` add the import:

```js
import { openCountsByChapter } from '../utils/catchGroups.js';
```

Before the `return (` of the component (after the loading/error early returns):

```js
  const catchCounts = openCountsByChapter(state.catches);
```

Replace the chapter list's `state.chapters.map(...)` button with:

```jsx
            {state.chapters.map((ch) => {
              const openCatches = catchCounts.get(ch.id) || 0;
              return (
                <button
                  key={ch.id}
                  className={`chapter-item${ch.id === editorState.chapterId ? ' active' : ''}${openCatches ? ' has-catches' : ''}`}
                  onClick={() => handleChapterSelect(ch.id)}
                >
                  <span className="chapter-item-num">Ch. {ch.number}</span>
                  <span className="chapter-item-title">{ch.title || 'Untitled'}</span>
                  {ch.status === 'outline' && (
                    <span className="chapter-item-badge outline">outline</span>
                  )}
                  {openCatches > 0 && (
                    <span
                      className="chapter-item-catch-dot"
                      title={`${openCatches} open catch${openCatches === 1 ? '' : 'es'}`}
                      aria-label={`${openCatches} open catch${openCatches === 1 ? '' : 'es'}`}
                    />
                  )}
                </button>
              );
            })}
```

- [ ] **Step 4: Dot CSS**

In `client/src/index.css`, after the `.chapter-item.active .chapter-item-num` rule, add:

```css
.chapter-item { position: relative; }
.chapter-item.has-catches .chapter-item-title { padding-right: 0.75rem; }
.chapter-item-catch-dot {
  position: absolute;
  top: 0.65rem;
  right: 0.6rem;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gold);
}
```

- [ ] **Step 5: Capture overlay labels**

In `client/src/components/overlays/CatchOverlay.jsx` add `import { chapterLabel } from '../../utils/catchGroups.js';` and change the option text from `Ch. {ch.number} — {ch.title || 'Untitled'}` to `{chapterLabel(ch)}`.

- [ ] **Step 6: Build and run both suites**

Run: `npm --prefix client test 2>&1 | tail -4 && npm --prefix client run build 2>&1 | tail -3 && npm --prefix server test 2>&1 | tail -4`
Expected: client 78 pass, build succeeds, server 82 pass.

- [ ] **Step 7: Browser walkthrough**

On the verification stack (same seed as Task 7, or a fresh one):

1. Load chapter 1 with the Quill tab active: the tab reads `Catch · 2` before the Catch tab was ever opened; the chapter list shows a gold dot on chapters 1 and 2 only, tooltip "2 open catches" / "1 open catch".
2. Switch to chapter 2: label becomes `Catch · 1`; the tab indicator underline matches the label width.
3. Mark both chapter-1 catches used: the label returns to `Catch`, chapter 1's dot disappears.
4. Ctrl+Shift+I: the overlay's chapter select shows `Ch. N — Title` labels; catching an idea tagged to the open chapter bumps the count.
5. Hooks (Quill tab → "Suggest 3 hooks"): "Context:" line includes `N writer's note(s)` when the chapter has open catches.
6. 390×844: chapter list and tab label fit; no horizontal page scroll.

Expected: each step as described; no console errors.

- [ ] **Step 8: Commit, then clean up**

```bash
git add client/src/context/ActiveWorkContext.jsx client/src/components/panel/RightPanel.jsx client/src/pages/MainRoom.jsx client/src/components/overlays/CatchOverlay.jsx client/src/index.css
git commit -m "feat: open-catch count on the Catch tab and dots in the chapter list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WmE8xEUSRzHfPdKBktKRg1"
rm -f client/vite.verify.config.js
```

Stop the Vite dev server, the API server and the Mongo container (see "Verification stack"). `git status --short` must be empty.
