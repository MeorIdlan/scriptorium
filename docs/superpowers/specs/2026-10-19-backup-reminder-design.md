# Backup reminder: design

- Card: https://trello.com/c/HtAIjidq (Remind the writer to back up)
- Epic: https://trello.com/c/OCQSvfai (Export and backup)
- PRD: FR-22, Q-4, G-2
- Builds on: `docs/superpowers/specs/2026-10-14-full-work-backup-design.md` (per-work backup) and `docs/superpowers/specs/2026-10-18-account-backup-design.md` (account backup)
- Date: 2026-10-19
- Track: architectural

## Goal

A backup only protects the writer if they actually make one. When a work has changes that no backup holds yet and its last backup is old, the app says so where the writer will see it, and lets them back up with one click. It must not nag: a reminder they can't quiet, or one that fires for a work they haven't touched, is a failure even if it technically works.

## Subtasks and acceptance

- S1 Decide Q-4 (channel and threshold), S2 Last-backup tracking, S3 Reminder rule, S4 Reminder UI, S5 Tests.
- A1 Each work records when it was last backed up (per-work or account backup).
- A2 A reminder appears for a work with changes that hasn't been backed up past the threshold.
- A3 The reminder offers a one-click backup and clears once a backup is made.
- A4 The writer can dismiss or snooze it.
- A5 Tests cover the threshold rule.

## Q-4, decided (S1)

The dev decided on 2026-10-19:
- **Channel: in-app only.** Shelves and the Main Room. No email, so no scheduled job and no Mailgun template.
- **Threshold: 7 days**, fixed (no setting).

## Scope

In:
- New fields on `Work`: when it was last backed up, when its content last changed, and reminder snooze/dismiss state.
- Stamping "last backed up" from both backup routes; stamping "content changed" from every content write.
- One server-side reminder rule, its result included in work responses.
- An endpoint to snooze or dismiss a work's reminder.
- A reminder strip on Shelves work cards and a banner in the Main Room, each with Back up now / Later / Dismiss.

Out:
- Email or any notification outside the app.
- A writer setting for the threshold, or a switch to turn reminders off.
- Showing the reminder anywhere else (Settings, Map, Codex rooms).
- Any change to the backup archive formats (see "Backup contents" below for the one thing that is filtered).
- Restore (FR-26).

## Decisions

### What counts as a change (the dev's choice)

**Any content edit counts.** Content means everything a backup holds that the writer made:
- chapters: create, save, delete, reorder, thread tags (`PUT /chapters/:id/threads`), scene moves, summary edits and regeneration, snapshot and milestone restores
- Codex (characters, places, rules, flags), Map, catches, plot threads
- work details (`PUT /api/works/:workId`)
- snapshots and milestones: create, rename, delete, restore (all change what a backup holds; my call, so the middleware can sit on the whole router)
- deletes on every content router (Codex, catches, threads, chapters) count too

**Not a change:** reads; AI calls (`/api/ai/*`); writing sessions; the export request (it can save manuscript details on the work, which is why `Work.updatedAt` can't be used as the signal); backup downloads; the reminder endpoint itself; daily progress and settings.

`Work.updatedAt` is not reliable for this: Codex, Map, catches and threads never bump it, and the export's manuscript-details save does.

### Fields on `Work` (S2)

All are ISO strings, like the model's other timestamps, with no defaults (absent means "never").
- `lastBackupAt`: when the latest completed backup started (see below).
- `contentChangedAt`: the latest successful content write.
- `backupReminder`: `{ snoozedUntil, dismissedAt }`, either may be absent.

**Old works** have no `contentChangedAt`. The rule treats a missing value as `updatedAt`, **but only when `updatedAt` differs from `createdAt`** (my call). `POST /api/works` sets both to the same instant, so a work that was created and never edited has no change, and needs no migration or cutoff marker. An old edited work may show one reminder it didn't strictly need; that's accepted.

**New works:** `POST /api/works` sets `contentChangedAt` only when it also creates the opening-hook Chapter 1 (my call): that chapter is content the writer typed. A work created without one has no `contentChangedAt` until its first content write.

### Stamping `contentChangedAt` (my call on the mechanism)

A small middleware, mounted on the content routers in `server.js` and on `PUT /api/works/:workId`, sets `contentChangedAt = now` on the work after the response finishes with a 2xx status, for non-GET requests only. The export, backup, sessions and AI routers don't get it. One extra `updateOne` per content write is acceptable; where a route already updates the `Work` (chapter saves through `wordCountService`), the builder may fold the stamp into that write instead, as long as the behaviour is the same. A failed stamp is logged and never fails the request.

### Stamping `lastBackupAt` (A1, my call on the timing)

- **Per-work backup** (`POST /api/works/:workId/backup`): when `writeWorkBackup` resolves (the archive finished streaming), set `lastBackupAt` to the time the request **started**. An edit made while the zip streams is later than that, so it still counts as unbacked.
- **Account backup** (`POST /api/backup`): when the whole account archive finishes, set `lastBackupAt` to the request's start time on every work that was included in it (not on works skipped because they were deleted mid-download). A download that fails or is cut short stamps nothing, since the file is useless.
- The server can only know the bytes were sent, not that the writer kept the file. That's accepted.
- Stamping also clears `backupReminder` (a fresh backup ends any snooze or dismiss).
- A failed stamp after a successful stream is logged; the response is already complete.

### The rule (S3, A2)

One pure function on the server, e.g. `backupReminderState(work, now)`, with a 7-day constant. A work is **due** when all of these hold:
1. **It has unbacked changes:** `changedAt = contentChangedAt ?? updatedAt` exists and is later than `lastBackupAt` (or there is no `lastBackupAt`).
2. **The clock has run out:** `now − base ≥ 7 days`, where `base` is the latest of `lastBackupAt`, `backupReminder.dismissedAt`, or, if there is neither, `createdAt`.
3. **It isn't snoozed:** no `snoozedUntil`, or `now ≥ snoozedUntil`.

Result shape (sent to the client): `{ due: boolean, lastBackupAt: string | null, daysSinceBackup: number | null }`, where `daysSinceBackup` counts whole days from `lastBackupAt` (null when never backed up). The client never recomputes the rule; it shows what the server says.

Never-backed-up works (the dev's choice): the clock runs from `createdAt`, and the work still needs changes, so an empty, untouched new work never reminds.

Dormant or completed works follow the same rule: with no new changes, they never remind.

### Snooze and dismiss (A4, the dev's choices)

`POST /api/works/:workId/backup-reminder` with `{ action: 'snooze' | 'dismiss' }`, behind `loadWork`, returning the work's new reminder result.
- **Later (snooze):** `snoozedUntil = now + 3 days`.
- **Dismiss:** `dismissedAt = now`. This restarts the 7-day clock as if a backup had been made, for the reminder only; `lastBackupAt` is untouched. It comes back 7 days later if there are changes. (The dev chose this over "until the next change", which for a daily writer would bring it back at the next keystroke.)
- Both live on the work, so they hold across devices and tabs.
- Any other `action` is a 400.

### Where the result appears

- `GET /api/works` (the Shelves list): add the reminder result as `backupReminder` on each work. The list's `INDEX_FIELDS` projection must include the fields the rule reads.
- `GET /api/works/:workId` (used by the Main Room): same field.
- The raw fields (`lastBackupAt`, `contentChangedAt`, `backupReminder` state) are server-owned. **`PUT /api/works/:workId` must strip them from the body**, since it spreads `req.body` into the update today.

### UI (S4, A3; the dev chose the card strip + room banner)

- **Shelves:** a due work's card gets a gold strip at its bottom: "Not backed up in N days" (or "Never backed up"), with **Back up now**, **Later** and a dismiss **✕**. Clicks inside the strip don't open the work.
- **Main Room:** a thin banner above the editor: "<Title> hasn't been backed up in N days" (or "…has never been backed up"), with **Back up now**, **Remind me later**, **Dismiss**. It is shown when the work is loaded and due; it doesn't re-check during the session (my call: the writer sees it on opening the work, which is enough).
- **Back up now** runs the same per-work download as the Export modal (`api.download('/works/:id/backup')`, blob then save). While it runs, the button shows "Backing up…"; on success the reminder hides immediately and the work's reminder state is refreshed from the server; on failure an inline error shows and the reminder stays.
- **Later / Dismiss** call the endpoint and hide the reminder on success.
- An account backup from Settings clears reminders the next time Shelves loads (it refetches on mount). No live cross-room sync.
- Styling follows `index.css`: dark background, `#c9a96e` gold accent, Georgia. A shared component can serve both places; that's the builder's call.

### Backup contents

`workRecord` in `backupService.js` spreads the whole work into `work.json`. The reminder fields (`lastBackupAt`, `contentChangedAt`, `backupReminder`) are left out of it (my call): they describe this database, not the work, and a restored work should start with a fresh clock. The manifest format version stays 1, since nothing a reader relies on changes.

## Tests (S5, A5)

- **The rule** (pure unit tests, pinned clock): no changes → not due; changes, 6 days 23 h since backup → not due; exactly 7 days → due; never backed up, created 8 days ago with changes → due; never backed up, no changes → not due; missing `contentChangedAt` with `updatedAt === createdAt` → not due; snoozed until tomorrow → not due; snooze expired → due; dismissed 3 days ago → not due; dismissed 8 days ago with later changes → due; dismissed 8 days ago, no change since backup → not due; missing `contentChangedAt` falls back to `updatedAt`.
- **Stamping** (HTTP tests, in-memory Mongo): a content write per router stamps `contentChangedAt`; an export request, a session, an AI call and a backup don't; a failed (4xx) write doesn't.
- **Backups:** a per-work backup sets `lastBackupAt` to its start time and clears snooze/dismiss; an account backup stamps every included work; an aborted download stamps nothing.
- **Endpoint:** snooze and dismiss set state and return the new result; unknown action → 400; another writer's work → 404.
- **PUT** `/api/works/:id` ignores the server-owned fields.
- **Responses:** `GET /api/works` and `GET /api/works/:id` include `backupReminder`.
- **Client** (linkedom): the strip/banner shows for a due work and not otherwise; Back up now hides it on success and keeps it with an error on failure; Later and Dismiss call the endpoint and hide it.

## Left to the builder

- The middleware's exact shape and where each router mounts it, within the change list above.
- Whether chapter saves fold the stamp into an existing `Work` write.
- Component structure and CSS class names.
- How the client refreshes the work's reminder state after a backup (refetch the work or update local state from a returned value).

## Risks

- **A content route added later without the middleware** won't count as a change. The middleware is mounted per router, so a new router has to opt in; a comment in `server.js` next to the mounts says so.
- **Extra write per autosave.** Chapter saves are frequent; one more small `updateOne` per save is fine at this scale.
