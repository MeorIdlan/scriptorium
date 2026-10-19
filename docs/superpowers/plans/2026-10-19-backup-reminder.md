# Backup Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remind the writer, on Shelves and in the Main Room, to back up a work that has unbacked changes and no backup in 7 days, with one-click backup, snooze and dismiss.

**Architecture:** The server owns everything: new timestamps on `Work`, a pure rule function, a middleware that stamps content changes, stamping in the two backup routes, and a `backupReminder` result on work responses plus a snooze/dismiss endpoint. The client only renders that result with one shared `BackupReminder` component.

**Tech Stack:** Express 4 + Mongoose (ESM), React 18, `node --test`, supertest + in-memory MongoDB (`server/test/support/http.js`), linkedom client tests (`client/test/support/app.js`).

**Spec:** `docs/superpowers/specs/2026-10-19-backup-reminder-design.md`

Card: https://trello.com/c/HtAIjidq. Every commit body ends with `Trello: https://trello.com/c/HtAIjidq`.

## Global Constraints

- Threshold `REMINDER_DAYS = 7`; snooze `SNOOZE_DAYS = 3`. Fixed, no setting.
- In-app only. No email, no scheduler.
- All timestamps are ISO strings (like the rest of `Work`), no schema defaults; absent means "never".
- **Naming (plan's call, resolves a clash in the spec):** the stored snooze/dismiss state is `Work.reminderState = { snoozedUntil, dismissedAt }`; the computed result sent to the client is `backupReminder = { due, lastBackupAt, daysSinceBackup }`.
- Server-owned fields `lastBackupAt`, `contentChangedAt`, `reminderState`, `backupReminder` can never be set through `PUT /api/works/:workId`.
- A failed stamp is logged (`console.error`) and never fails or changes the response.
- Copy: Shelves strip "Not backed up in N days" / "Never backed up"; Main Room banner "<Title> hasn't been backed up in N days" / "<Title> has never been backed up". Buttons: card `Back up now`, `Later`, `✕` (aria-label "Dismiss"); banner `Back up now`, `Remind me later`, `Dismiss`. While backing up: `Backing up…`. Use "day" for N = 1.
- Styling in `client/src/index.css`: gold `#c9a96e` accent on the dark theme, Georgia.
- Server tests: `cd server && npm test` (or `node --test test/<file>`), client: `cd client && npm test`. In a fresh worktree run `npm ci` in both first.

## Review Focus

1. **Rapid autosaves** — many chapter saves must each stamp without failing a save if the stamp write errors. Test in Task 2: a stamp whose `updateOne` rejects still returns the route's 2xx.
2. **A 4xx/5xx content write** (validation error, someone else's work) must not stamp. Test in Task 2.
3. **A backup cut short** (client disconnects) must not set `lastBackupAt`. Test in Task 3.
4. **Edits during a backup stream** must stay "unbacked": `lastBackupAt` is the request start, so a `contentChangedAt` written mid-stream is later. Test in Task 3.
5. **Clicking inside the Shelves strip** must not open the work (card's `onClick` navigates). Test in Task 5.

---

### Task 1: The reminder rule and the new Work fields (→ S2, S3, S5)

**Files:**
- Modify: `server/src/models/Work.js` (add fields)
- Create: `server/src/services/backupReminder.js`
- Test: `server/test/backupReminder.test.js`

**Interfaces:**
- Produces:
  - `Work` fields: `lastBackupAt: String`, `contentChangedAt: String`, `reminderState: { snoozedUntil: String, dismissedAt: String }` (Mixed or subdocument with `_id: false`, no defaults).
  - `REMINDER_DAYS = 7`, `SNOOZE_DAYS = 3`, `SERVER_OWNED_FIELDS = ['lastBackupAt', 'contentChangedAt', 'reminderState', 'backupReminder']`.
  - `backupReminderState(work, now: Date) -> { due: boolean, lastBackupAt: string|null, daysSinceBackup: number|null }` — pure; `work` is a plain object or doc.
  - `withBackupReminder(work, now = new Date()) -> object` — `work.toJSON?.() ?? work` plus `backupReminder: backupReminderState(work, now)`.

- [ ] **Step 1: Write the failing tests** in `server/test/backupReminder.test.js`, one `test()` per case, all with a fixed `now = new Date('2026-10-20T12:00:00Z')` and a helper `daysAgo(n)` returning an ISO string. `due` expectations:
  - backed up 10 d ago, `contentChangedAt` 11 d ago (no change since) → `false`
  - backed up 6 d 23 h ago, changed 1 d ago → `false`
  - backed up exactly 7 d ago, changed 1 d ago → `true`, `daysSinceBackup === 7`, `lastBackupAt` echoed
  - never backed up, created 8 d ago, changed 2 d ago → `true`, `lastBackupAt === null`, `daysSinceBackup === null`
  - never backed up, created 8 d ago, no `contentChangedAt`, `updatedAt === createdAt` → `false`
  - no `contentChangedAt`, `updatedAt` 2 d ago ≠ `createdAt` 20 d ago, never backed up → `true` (fallback)
  - due case but `reminderState.snoozedUntil` tomorrow → `false`; `snoozedUntil` 1 h ago → `true`
  - backed up 20 d ago, `dismissedAt` 3 d ago, changed 1 d ago → `false`
  - backed up 20 d ago, `dismissedAt` 8 d ago, changed 1 d ago → `true`
  - backed up 20 d ago, `dismissedAt` 8 d ago, changed 21 d ago → `false`
  - `withBackupReminder` on a `new Work({...})` doc returns `id` (not `_id`) and a `backupReminder` object.

- [ ] **Step 2: Run** `cd server && node --test test/backupReminder.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the fields and `backupReminder.js` per the spec's rule: `changedAt = contentChangedAt ?? (updatedAt !== createdAt ? updatedAt : null)`; unbacked = `changedAt && (!lastBackupAt || changedAt > lastBackupAt)`; `base = max(lastBackupAt, dismissedAt) ?? createdAt`; due = unbacked && `now − base ≥ 7 d` && not (`snoozedUntil && now < snoozedUntil`). Compare as `Date` values, not strings. `daysSinceBackup = floor((now − lastBackupAt) / 1 d)`.

- [ ] **Step 4: Run** the same command — Expected: all PASS.

- [ ] **Step 5: Commit** `feat(backup): add backup reminder rule and Work fields`.

### Task 2: Stamp `contentChangedAt` on content writes (→ S2, S5)

**Files:**
- Create: `server/src/middleware/stampContentChange.js`
- Modify: `server/src/routes/{chapters,snapshots,milestones,codex,catches,map,threads}.js` (add `router.use(stampContentChange)` right after the router is created, before `loadWork` or any route), `server/src/routes/works.js` (PUT `/:workId` gets the middleware; PUT strips `SERVER_OWNED_FIELDS`; POST sets `contentChangedAt: now` only when it creates the opening-hook chapter), `server/src/server.js` (comment next to the mounts: content routers opt in with `stampContentChange`; export, backup, sessions and AI must not)
- Modify: `server/test/support/http.js` — `buildApp()` also mounts `codex`, `catches`, `map` routers at their `server.js` paths
- Test: `server/test/contentStamp.routes.test.js`

**Interfaces:**
- Consumes: `SERVER_OWNED_FIELDS` (Task 1).
- Produces: `stampContentChange(req, res, next)` — captures `req.params.workId` and `req.user.id` at call time; on `res` `'finish'`, if `req.method !== 'GET'` and `200 ≤ statusCode < 300` and a workId exists, runs `Work.updateOne({ _id: workId, ownerId: userId }, { $set: { contentChangedAt: new Date().toISOString() } })`, catching and logging errors. Calls `next()` immediately. Exported also as `stampWork(workId, userId)` for direct use if the builder folds it anywhere.

- [ ] **Step 1: Write the failing tests** (supertest on `buildApp()`, in-memory Mongo; seed a work for `user_a` with no `contentChangedAt`; after each request `await` a short settle — e.g. poll `Work.findById` up to 20×10 ms — since the stamp runs after `'finish'`):
  - `creating a chapter stamps contentChangedAt`
  - `saving a chapter stamps contentChangedAt`
  - `adding a codex character, a catch, a thread, and saving the map each stamp contentChangedAt` (one test per router)
  - `renaming a milestone stamps contentChangedAt`
  - `PUT /api/works/:id stamps contentChangedAt and ignores lastBackupAt, contentChangedAt, reminderState and backupReminder in the body` (send `lastBackupAt: '2000-01-01T00:00:00.000Z'` and `reminderState: {...}`; assert they're unchanged)
  - `GET requests don't stamp`
  - `a failed write doesn't stamp` (e.g. `POST /threads` with no name → 400) and `another writer's request doesn't stamp` (`x-test-user: user_b` → 404)
  - `a stamp that fails doesn't fail the request` (`mock.method(Work, 'updateOne', async () => { throw new Error('boom') })` for the stamp; the chapter save still returns 200)
  - `POST /api/works with an opening hook sets contentChangedAt; without one it doesn't`
  - In a small local app mounting `exportRouter` and `sessionsRouter` at their paths: `an export request and a writing session don't stamp` (export with a manuscript override body so `manuscriptDetails` writes the work).

- [ ] **Step 2: Run** `cd server && node --test test/contentStamp.routes.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement** the middleware and router changes listed above.

- [ ] **Step 4: Run** the new file, then the full `npm test` — Expected: all PASS (existing route tests unaffected).

- [ ] **Step 5: Commit** `feat(backup): record when a work's content last changed`.

### Task 3: Stamp `lastBackupAt` from both backups (→ S2, S5)

**Files:**
- Modify: `server/src/services/backupReminder.js` (add `markBackedUp`), `server/src/routes/backup.js`, `server/src/routes/accountBackup.js`, `server/src/services/backupService.js` (`workRecord` omits `lastBackupAt`, `contentChangedAt`, `reminderState`)
- Test: add to `server/test/backup.routes.test.js`, `server/test/accountBackup.routes.test.js`, `server/test/backupEntries.test.js`

**Interfaces:**
- Produces: `markBackedUp(workIds: string[], ownerId: string, startedAt: string) -> Promise<void>` — `Work.updateMany({ _id: { $in: workIds }, ownerId }, { $set: { lastBackupAt: startedAt }, $unset: { reminderState: 1 } })`; errors caught and logged.
- Routes capture `startedAt = new Date().toISOString()` before streaming and call `markBackedUp` only after `writeWorkBackup` / `writeAccountBackup` resolves (account: ids from the returned `items[].workId`).

- [ ] **Step 1: Write the failing tests:**
  - backup.routes: `a finished backup sets lastBackupAt to the request's start time and clears reminderState` (pin the clock with `mock.timers.enable({ apis: ['Date'], now })`, or assert `lastBackupAt ≤` a timestamp taken just after the request was sent and `≥` one taken just before)
  - backup.routes: `an edit made while the backup streams stays later than lastBackupAt` (set `contentChangedAt` to now after the request starts via the `entries` hook or by asserting `lastBackupAt < contentChangedAt` written after start)
  - backup.routes: `a backup cut short doesn't set lastBackupAt` (reuse the file's existing disconnect pattern with `http`)
  - accountBackup.routes: `a finished account backup stamps every included work, not other writers' works`
  - accountBackup.routes: `an account backup cut short stamps nothing`
  - backupEntries: `work.json leaves out lastBackupAt, contentChangedAt and reminderState`

- [ ] **Step 2: Run** those three files — Expected: the new tests FAIL.

- [ ] **Step 3: Implement** `markBackedUp`, the route calls and the `workRecord` filter.

- [ ] **Step 4: Run** the three files, then full `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(backup): record when each work was last backed up`.

### Task 4: Reminder in work responses + snooze/dismiss endpoint (→ S3, S5)

**Files:**
- Modify: `server/src/routes/works.js` (`INDEX_FIELDS` adds `updatedAt lastBackupAt contentChangedAt reminderState`; `GET /` maps `withBackupReminder`; `GET /:workId` returns `withBackupReminder(work)`)
- Create: `server/src/routes/backupReminder.js`; mount in `server/src/server.js` at `/api/works/:workId/backup-reminder` with `auth`; mount in `server/test/support/http.js` too
- Test: `server/test/backupReminder.routes.test.js`

**Interfaces:**
- Consumes: `withBackupReminder`, `backupReminderState`, `SNOOZE_DAYS` (Task 1).
- Produces:
  - `GET /api/works` → each item has `backupReminder: { due, lastBackupAt, daysSinceBackup }`.
  - `GET /api/works/:workId` → same field.
  - `POST /api/works/:workId/backup-reminder` body `{ action: 'snooze' | 'dismiss' }` → `200 { backupReminder }`. Router uses `loadWork` (404 for others' works). `snooze` sets `reminderState.snoozedUntil = now + 3 d`; `dismiss` sets `reminderState.dismissedAt = now` (and keeps any snooze untouched). Anything else → `400 INVALID_FIELD` via `httpError`. Does **not** use `stampContentChange`.

- [ ] **Step 1: Write the failing tests:**
  - `GET /api/works includes backupReminder, due for a work changed 8 days after creation with no backup` (seed with dates in the past, no clock mocking needed)
  - `GET /api/works/:id includes backupReminder`
  - `snooze hides a due reminder and sets snoozedUntil 3 days ahead` (assert response `due === false` and stored value within ±1 min of now+3 d)
  - `dismiss hides a due reminder and sets dismissedAt; lastBackupAt is untouched`
  - `snooze and dismiss don't stamp contentChangedAt`
  - `an unknown action is a 400`; `another writer's work is a 404`

- [ ] **Step 2: Run** `cd server && node --test test/backupReminder.routes.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement** the route and the works changes.

- [ ] **Step 4: Run** it, then full `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(backup): expose the backup reminder and let writers snooze it`.

### Task 5: `BackupReminder` component + Shelves card strip (→ S4, S5)

**Files:**
- Create: `client/src/components/backup/BackupReminder.jsx`
- Create: `client/src/utils/saveFile.js` — move `saveFile(blob, filename)` out of `ExportModal.jsx` and import it in both places
- Modify: `client/src/components/shelves/WorkCard.jsx` (render `<BackupReminder variant="card">` at the bottom of the card), `client/src/index.css`
- Test: `client/test/backupReminder.test.js`

**Interfaces:**
- Consumes: `GET /works/:id` and `POST /works/:id/backup-reminder` (Task 4), `POST /works/:id/backup` (existing), `api.download`.
- Produces: `BackupReminder({ work, variant: 'card' | 'banner', onChange(backupReminder) })`. Renders nothing unless `work.backupReminder?.due`. Root has `data-testid="backup-reminder"` and stops click propagation. Copy per Global Constraints.
  - **Back up now:** `api.download('/works/${id}/backup', {}, 'backup.zip')` → `saveFile` → `api.get('/works/${id}')` → `onChange(fresh.backupReminder)`. Button reads `Backing up…` and is disabled while running. On failure show the error in a `.form-error` and keep the reminder.
  - **Later / Dismiss:** `api.post('/works/${id}/backup-reminder', { action })` → `onChange(res.backupReminder)`. On failure show the error, keep the reminder.
  - WorkCard passes `onChange={(backupReminder) => updateWork(work.id, { backupReminder })}`.

- [ ] **Step 1: Write the failing tests** (pattern from `client/test/backupModal.test.js`: `renderApp` with `routes`, stub `URL.createObjectURL`, stub fetch for the binary backup route):
  - `the card shows "Not backed up in 12 days" for a due work` (render `WorkCard` with `backupReminder: { due: true, lastBackupAt: '…', daysSinceBackup: 12 }`)
  - `a never-backed-up due work shows "Never backed up"`
  - `no strip when backupReminder.due is false or missing`
  - `Back up now downloads the work's backup and hides the strip` (fresh GET returns `due: false`; assert `POST /works/w1/backup` was called, a blob was saved, strip gone)
  - `a failed backup keeps the strip and shows the error`
  - `Later posts action snooze and hides the strip`; `the ✕ posts action dismiss and hides the strip`
  - `clicking inside the strip doesn't open the work` (render inside a `MemoryRouter` route; assert location unchanged / navigate not called)
  - Existing `client/test/backupModal.test.js` still passes after the `saveFile` move.

- [ ] **Step 2: Run** `cd client && node --test test/backupReminder.test.js` (match the `npm test` loader flags in `client/package.json`) — Expected: FAIL.

- [ ] **Step 3: Implement** the component, `saveFile` move, WorkCard wiring and CSS (`.backup-reminder`, `.backup-reminder--card`, `.backup-reminder--banner`).

- [ ] **Step 4: Run** it, then full `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(backup): show a backup reminder on Shelves work cards`.

### Task 6: Main Room banner (→ S4, S5)

**Files:**
- Modify: `client/src/context/ActiveWorkContext.jsx` (add `updateWork(partial)` → `UPDATE_WORK` merging into `state.work`), `client/src/pages/MainRoom.jsx` (render `<BackupReminder variant="banner">` at the top of `.editor-area`, above `.editor-wrap`), `client/src/index.css`
- Test: add to `client/test/backupReminder.test.js`

**Interfaces:**
- Consumes: `BackupReminder` (Task 5).
- Produces: `useActiveWork().updateWork(partial)`. MainRoom passes `work={state.work}` and `onChange={(backupReminder) => updateWork({ backupReminder })}`.

- [ ] **Step 1: Write the failing tests** (render `MainRoom` via `renderApp` at `/work/w1`, route `/work/:workId`, with `GET /works/w1` returning a due work and `GET /works/w1/chapters` returning `[]`):
  - `the Main Room shows "<Title> hasn't been backed up in 9 days" for a due work`
  - `the Main Room shows no banner when the work isn't due`
  - `Remind me later hides the banner` (posts `snooze`)

- [ ] **Step 2: Run** the client test file — Expected: new tests FAIL.

- [ ] **Step 3: Implement** `updateWork` and the banner.

- [ ] **Step 4: Run** full `cd client && npm test` and `cd server && npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(backup): show the backup reminder in the Main Room`.

---

## Acceptance → proof

| Criterion | Proven by |
|---|---|
| A1 Each work records when it was last backed up (per-work or account backup) | Task 3: `a finished backup sets lastBackupAt…`, `a finished account backup stamps every included work…` |
| A2 A reminder appears for a work with changes past the threshold | Task 1 rule tests; Task 2 stamping tests; Task 4 `GET /api/works includes backupReminder, due…`; Task 5 `the card shows…`; Task 6 `the Main Room shows…` |
| A3 One-click backup that clears the reminder | Task 5 `Back up now downloads the work's backup and hides the strip`; Task 3 `…clears reminderState` |
| A4 Dismiss or snooze | Task 4 snooze/dismiss tests; Task 5 `Later…` / `✕…`; Task 6 `Remind me later…` |
| A5 Tests cover the threshold rule | Task 1 `server/test/backupReminder.test.js` (the 6 d 23 h / exactly 7 d boundary cases) |

Subtask coverage: S1 done in the design (Gate 3); S2 → Tasks 1–3; S3 → Tasks 1, 4; S4 → Tasks 5, 6; S5 → every task.
