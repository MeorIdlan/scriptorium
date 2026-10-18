# Whole-account backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One action on Settings downloads a single zip holding one complete per-work backup for every work the signed-in writer owns.

**Architecture:** A new `writeAccountBackup` in `backupService.js` streams an outer zip of stored inner zips, each produced by the existing `writeWorkBackup` into a PassThrough, followed by an account `manifest.json`. A new `POST /api/backup` route feeds it the writer's works. Settings submits a hidden form to that route, so the browser downloads natively.

**Tech Stack:** Express 4, Mongoose, archiver 8 (`ZipArchive`), yauzl (tests), React 18, Node test runner, linkedom.

**Spec:** `docs/superpowers/specs/2026-10-18-account-backup-design.md`

**Card:** https://trello.com/c/EJUXWYvS. Subtasks: S1 Account archive, S2 Entry point in the UI, S3 Large-account handling, S4 Tests.

## Global Constraints

- Download name: `scriptorium-backup-YYYY-MM-DD.zip` (UTC date).
- Inner entries: `works/<exportBasename(title)>-<workId>.zip`, stored (`store: true`), byte-for-byte what `writeWorkBackup` writes.
- Account manifest: `format: "scriptorium-account-backup"`, `formatVersion: 1`, `exportedAt`, `works: [{ path, workId, title, bytes, sha256 }]`, in archive order. No user id or email in it. Written last.
- Works ordered by `createdAt` ascending, then `_id`.
- Response headers: `Content-Type: application/zip`, `Content-Disposition` from the shared helper, `X-Accel-Buffering: no`. No `Content-Length`.
- The `Settings` collection is never read.
- `writeWorkBackup`'s per-work output and the existing backup tests stay unchanged.
- No new dependencies.
- Server tests: `wsl -d ubuntu -e sh -c "cd server && npm test"` (in-memory mongod; not in the Alpine container). Client: `wsl -d ubuntu -e sh -c "cd client && npm test"`. Inside a WSL shell, drop the prefix.
- Commits: Conventional Commits, body ends with `Trello: https://trello.com/c/EJUXWYvS` and the session's Co-Authored-By line.

## Review Focus

1. **A work deleted (or reassigned) after the list is read but before its turn.** Expected: it is skipped and left out of the manifest, and the download succeeds. Pinned in Task 2 (the route re-reads each work by `_id` and `ownerId` as its turn comes).
2. **Two works with the same title.** Expected: two distinct inner zips, because the id is in the name. Pinned in Task 2.
3. **An inner entry bigger than the stream buffers (backpressure).** Expected: no deadlock between the inner archive, the PassThrough and the outer archive. Pinned in Task 1 (a ~2 MB fake entry in many chunks).
4. **A title with slashes, quotes or only non-Latin letters.** Expected: a flat, safe `works/…zip` path, never a nested folder. Pinned in Task 2.
5. **A double click on the button.** Expected: one download. Pinned in Task 3 (the button is disabled after the first submit).

---

### Task 1: `writeAccountBackup` streaming service (→ S1, S3, S4)

**Files:**
- Modify: `server/src/services/backupService.js`
- Test: `server/test/accountBackupWrite.test.js` (new)

**Interfaces:**
- Consumes: `writeWorkBackup(work, output, { entries })`, `measuring(onEnd)` (both in `backupService.js`); `exportBasename(title)` from `server/src/routes/export.js`.
- Produces:
  - `export const ACCOUNT_FORMAT = 'scriptorium-account-backup'`
  - `export const ACCOUNT_FORMAT_VERSION = 1`
  - `export function accountEntryPath(work): string`, giving `works/${exportBasename(work.title)}-${String(work._id)}.zip`
  - `export async function writeAccountBackup(works, output, { entries } = {}): Promise<Array<{ path, workId, title, bytes, sha256 }>>`. `works` is a sync or async iterable of `{ _id, title }`. `entries` is passed through to each `writeWorkBackup` call (tests inject fakes; omitted means the real `workEntries`).

The approach, which the spec fixes: an outer `ZipArchive` piped to `output`. For each work: append a PassThrough to the outer archive under `accountEntryPath(work)` with `store: true`, measure it with `measuring()` (the same pattern as `appendEntry`), and `await` both `writeWorkBackup(work, passThrough, { entries })` and the measured entry's end before moving to the next work. Then append the manifest (`JSON.stringify(…, null, 2)`) and finalize. On failure or on the output's `close` before finishing: destroy the current PassThrough (which makes the inner `writeWorkBackup` reject and abort), abort the outer archive, and rethrow. Mirror `writeWorkBackup`'s `failed` promise and its rule of rejecting immediately when the output is already destroyed. If an inner PassThrough's `close` after a *successful* inner finish trips `writeWorkBackup`'s disconnect check, fix it inside `writeWorkBackup` without changing its output.

- [ ] **Step 1: Write the failing tests** in `server/test/accountBackupWrite.test.js`, reusing the `bufferOutput()` and `fakeEntries()` helpers from `backupWrite.test.js` (copy them in; they're 15 lines):
  - `one stored inner zip per work, each a valid work backup (A1, A4)`: three works `{ _id: 'w1', title: 'One' }`, `{ _id: 'w2', title: 'Two' }`, `{ _id: 'w3', title: 'Three' }`, with fake entries `['work.json','work','{}']`. Unzip the output: the keys are exactly `['works/One-w1.zip','works/Two-w2.zip','works/Three-w3.zip','manifest.json']`. Each inner buffer unzips to `['work.json','manifest.json']`, and its manifest has `format === 'scriptorium-work-backup'` and `work.id` equal to its work id. The outer entries use compression method 0 (stored), read with yauzl's `entry.compressionMethod` (add an optional `withMeta` to `support/zip.js` or read it inline).
  - `account manifest lists every inner zip with its size and hash`: `format === 'scriptorium-account-backup'`, `formatVersion === 1`, a parseable ISO `exportedAt`, three `works` items in order, each with `bytes === inner.length`, `sha256` equal to the sha256 of the inner buffer, and the correct `workId`/`title`. No key named `ownerId`, `userId` or `email` anywhere in it.
  - `an empty account gives an archive with only the manifest`: `works: []` → keys `['manifest.json']`, `manifest.works` deep-equals `[]`.
  - `a large inner entry streams without deadlock (review focus 3)`: one work whose fake entry yields 512 chunks of 4 KiB. It resolves within the test, and the inner `work.json` is 2 MiB long.
  - `bytes reach the output before the last work is read (A3 automated)`: `works` is an async generator that, before yielding the third work, awaits until the output has emitted at least one `data` chunk (the same technique as `backupStream.test.js` "bytes reach the output while later rows are still unread"). The test must finish rather than time out.
  - `a failing work rejects and no later work is read`: work 2's fake entries throw. `writeAccountBackup` rejects, and the generator never yields work 3 (track it with a flag).
  - `a client disconnect stops further works`: destroy the output after the first `data` chunk. The call rejects with a message matching `/disconnected/`, and work 3 is never pulled.
  - `an output destroyed before the call rejects and reads nothing`: matching the existing per-work test.

- [ ] **Step 2: Run them to make sure they fail**
  Run: `cd server && node --test test/accountBackupWrite.test.js`
  Expected: FAIL (`writeAccountBackup` is not exported).

- [ ] **Step 3: Implement** `ACCOUNT_FORMAT`, `ACCOUNT_FORMAT_VERSION`, `accountEntryPath` and `writeAccountBackup` in `backupService.js`, as described above.

- [ ] **Step 4: Run the new tests and all the old backup tests**
  Run: `cd server && node --test test/accountBackupWrite.test.js test/backupWrite.test.js test/backupStream.test.js test/backupEntries.test.js test/backupManifest.test.js`
  Expected: all PASS, with no edits to the old test files.

- [ ] **Step 5: Commit** `feat(backup): stream an account archive of per-work zips`

### Task 2: `POST /api/backup` route (→ S1, S3, S4)

**Files:**
- Create: `server/src/routes/accountBackup.js`
- Modify: `server/src/routes/export.js` (export `contentDisposition(filename)`, and use it in the export route too)
- Modify: `server/src/routes/backup.js` (import `contentDisposition` from `export.js` and delete its local copy)
- Modify: `server/src/server.js` (`app.use('/api/backup', auth, accountBackupRouter)`, next to the per-work backup mount)
- Test: `server/test/accountBackup.routes.test.js` (new)

**Interfaces:**
- Consumes: `writeAccountBackup(works, output)` and `accountEntryPath` from Task 1; `writeWorkBackup` (for the equality test); `exportBasename`.
- Produces: `export function contentDisposition(filename): string` in `routes/export.js`; `export async function* ownedWorks(userId)` in `routes/accountBackup.js`; a default-export router handling `POST /`.

`ownedWorks(userId)`: read `Work.find({ ownerId: userId }).select('_id').sort({ createdAt: 1, _id: 1 }).lean()` once, as an array. Then, for each id, as its turn comes, `Work.findOne({ _id: id, ownerId: userId }).select('_id title').lean()`, and yield it if it isn't null. This is review focus 1, and it avoids the idle-cursor timeout. The route copies the per-work route's header and error handling (strip the download headers and call `next(err)` before any bytes are sent; otherwise log `account backup failed mid-stream` and call `res.destroy(err)`).

- [ ] **Step 1: Write the failing tests** in `server/test/accountBackup.routes.test.js`. Use the harness from `backup.routes.test.js` (`startDb`/`clearDb`, the `x-test-user` fake auth, `binary` parser, `unzip`), mounting `accountBackupRouter` at `/api/backup`. Seed works with a chapter, a codex and a snapshot each.
  - `one inner zip per owned work and none of another writer's (A1, A2, A4)`: user_a owns 3 works, user_b owns 1. The response is 200, `content-type` is `application/zip`, and `x-accel-buffering` is `no`. Keys starting `works/` number exactly 3, and their set equals `accountEntryPath(work)` for user_a's works, in `createdAt` order. user_b's work id appears in no entry name and no manifest item.
  - `each inner zip matches a standalone backup of that work (A1)`: for each user_a work, run `writeWorkBackup(work, bufferOutput)` directly. Its unzipped entries, except `manifest.json`, equal the inner zip's byte for byte, and the inner manifest's `items` equal the standalone manifest's `items`.
  - `the download is named scriptorium-backup-<UTC date>.zip`: `content-disposition` matches `/filename="scriptorium-backup-\d{4}-\d{2}-\d{2}\.zip"/`.
  - `a writer with no works gets a manifest-only archive`: user_c → keys `['manifest.json']`, `works: []`.
  - `no AI key or provider settings appear in the archive`: seed a `Settings` doc for user_a with `apiKey: 'sk-test-SECRET'`. The outer buffer and every inner zip's unzipped entries contain neither `sk-test-SECRET` nor `apiKey`.
  - `a form POST gets the same archive`: `.type('form').send('')` → 200 zip with 3 inner entries.
  - `two works with the same title get distinct entries (review focus 2)`: two works titled `Draft` → two different `works/Draft-<id>.zip` keys.
  - `odd titles give flat, safe entry names (review focus 4)`: titles `a/b "c"` and `日本語` → each inner key matches `/^works\/[^/]+\.zip$/`.
  - `a work deleted after the list is read is skipped (review focus 1)`: call `ownedWorks('user_a')` directly; after the first yield, delete the second work; collect the rest. It yields the first and third only.
  - `a failure before the first byte is a JSON error`: mock `Work.find` to throw (as `backup.routes.test.js` does) → non-200 JSON, no `content-disposition`.

- [ ] **Step 2: Run them to make sure they fail**
  Run: `cd server && node --test test/accountBackup.routes.test.js`
  Expected: FAIL (the module doesn't exist).

- [ ] **Step 3: Implement** `contentDisposition` in `export.js` (the per-work route's body, moved), `routes/accountBackup.js`, and the mount in `server.js`.

- [ ] **Step 4: Run the whole server suite**
  Run: `cd server && npm test`
  Expected: all PASS, including `backup.routes.test.js` and `export.routes.test.js` unchanged. The `chapterDailyProgress` "two tabs" test is a known flake (card G4fG2MUY). Re-run it once if it alone fails.

- [ ] **Step 5: Check the mount is behind auth**: `grep -n "api/backup" server/src/server.js` shows `auth` in the `app.use` line.

- [ ] **Step 6: Commit** `feat(backup): add POST /api/backup for the whole account`

### Task 3: Backup section on Settings (→ S2, S4)

**Files:**
- Create: `client/src/components/settings/AccountBackup.jsx`
- Modify: `client/src/pages/Settings.jsx` (render `<AccountBackup />` as the last `settings-section` inside `.settings-form`, outside any AI-only condition)
- Test: `client/test/accountBackup.test.js` (new)

**Interfaces:**
- Consumes: `POST /api/backup` from Task 2.
- Produces: `export default function AccountBackup()`.

Markup the tests rely on:
- `<section className="settings-section">` with `<h2 className="settings-section-title">Backup</h2>`.
- A description paragraph saying the archive is a full backup of every work (chapters, history, plot threads, Codex and Map), one file per work, with no settings or API keys.
- A hidden `<form method="POST" action="/api/backup" target="account-backup-frame" data-testid="account-backup-form">` and `<iframe name="account-backup-frame" title="Backup download" hidden>`.
- A `<button type="button" data-testid="account-backup-button">` reading `Back up everything (.zip)`. On click it calls `formRef.current.submit()`, sets `started`, and disables the button. While `started` is set, it shows `Your download has started. Check your browser's downloads.` A 5 s timer (cleared on unmount) resets it.

- [ ] **Step 1: Write the failing tests** in `client/test/accountBackup.test.js`, using `renderApp`/`click` from `test/support`:
  - `Settings shows the Backup section with AI off`: `renderApp(h(Settings), { ai: false })`. The text matches `/Backup/` and `/Back up everything \(\.zip\)/`.
  - `the hidden form posts to /api/backup into the hidden frame`: on the form, `getAttribute('method')` lowercased is `'post'`, `action` is `'/api/backup'`, and `target` equals the iframe's `name`.
  - `clicking submits once and disables the button (review focus 5)`: replace `form.submit` on the queried element with a counter, click the button twice. The counter is `1`, `button.disabled === true`, and the text matches `/download has started/`. Compare strings and booleans only (linkedom `assert.equal` on nodes hangs).

- [ ] **Step 2: Run them to make sure they fail**
  Run: `cd client && node --import ./test/support/register.js --test test/accountBackup.test.js`
  Expected: FAIL (no Backup section).

- [ ] **Step 3: Implement** `AccountBackup.jsx` and render it in `Settings.jsx`. Use the existing `settings-section`/`settings-field`/`btn` classes. Add CSS only if the hidden iframe needs it (it shouldn't, since `hidden` is enough).

- [ ] **Step 4: Run the whole client suite**
  Run: `cd client && npm test`
  Expected: all PASS.

- [ ] **Step 5: Commit** `feat(settings): add a whole-account backup button`

### Task 4: A3 timed run and browser check (→ S3)

No repo changes. Evidence goes on the card.

- [ ] **Step 1: Write a throwaway script in the session scratchpad** (not in the repo). It starts `mongodb-memory-server-core`, seeds 30 works for one user (10 small, 15 of ~20k words, 5 of ~150k words split into 30 chapters, each chapter with 20 snapshots), mounts `accountBackupRouter` behind a fake `req.user`, then requests `POST /api/backup` with Node's `http` client. It logs the time to first byte, the longest gap between chunks, the total time, the total bytes and the peak `process.memoryUsage().rss`, then unzips and checks for 30 `works/*.zip` entries.
- [ ] **Step 2: Run it in WSL.** Pass condition: the time to first byte and the longest gap are both well under 100 s (they should be a few seconds at most), and there are 30 inner entries.
- [ ] **Step 3: Browser check with the dev auth bypass:** run the server and client locally (per the vault gotcha, point the Vite proxy at localhost with a temporary config, then remove it), open `/settings`, click "Back up everything (.zip)", and confirm the browser saves `scriptorium-backup-<date>.zip` with one inner zip per work. If no browser is available, use Playwright.
- [ ] **Step 4: Post the numbers to the card** as A3 evidence.

## Acceptance → proof

| Criterion | Proof |
|---|---|
| A1 single archive, one complete work backup per owned work | Task 2 `one inner zip per owned work…` and `each inner zip matches a standalone backup…`; Task 1 `one stored inner zip per work…` |
| A2 only the signed-in writer's works | Task 2 `one inner zip per owned work and none of another writer's` |
| A3 many works without timing out | Task 1 `bytes reach the output before the last work is read`; Task 4 timed run on 30 works (card) |
| A4 tests check one entry per owned work | Task 2 and Task 1 entry-count assertions |

Subtask coverage: S1 → Tasks 1, 2. S2 → Task 3. S3 → Tasks 1, 2, 4. S4 → Tasks 1, 2, 3.
