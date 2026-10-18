# Whole-account backup: design

- Card: https://trello.com/c/EJUXWYvS (Download a backup of the whole account)
- Epic: https://trello.com/c/OCQSvfai (Export and backup)
- PRD: FR-21, G-2
- Builds on: `docs/superpowers/specs/2026-10-14-full-work-backup-design.md` (per-work backup, PR #16)
- Date: 2026-10-18
- Track: architectural

## Goal

With one action, a writer downloads one archive holding a complete backup of every work they own. The dev pictures this archive as the "everything, just in case" copy: it sits in a folder, and if it's ever used, it's used to restore the whole account at once. MVP 2 restore (FR-26) reads per-work archives, so the account archive is built from exactly those archives, unchanged. Restoring everything then means looping the per-work restore.

## Subtasks and acceptance

- S1 Account archive, S2 Entry point in the UI, S3 Large-account handling, S4 Tests.
- A1 One action downloads a single archive with one complete work backup per owned work.
- A2 It includes only the signed-in writer's works.
- A3 It works for an account with many works without timing out.
- A4 Tests check one entry per owned work.

## Scope

In:
- `POST /api/backup`, behind `requireAuth`, which streams a zip of every work where `ownerId` is `req.user.id`.
- Inside it: one per-work backup zip per owned work, in today's format (`scriptorium-work-backup`, `formatVersion` 1), plus an account `manifest.json`.
- A "Backup" section on `/settings` with a "Back up everything (.zip)" button.

Out:
- Writer settings, `DailyProgress`, sessions and auth data. The dev chose works only (2026-10-18), the same as the per-work spec. The `Settings` document, which holds the AI keys, is never read.
- Reminder (HtAIjidq, FR-22). Whether an account backup counts as backing up each work is for that card to decide. This card records nothing on `Work`.
- Restore (QTpL7b2y, FR-26). This spec only fixes the account format, and each inner archive is already in the format restore will read.
- Any change to the per-work archive format or to `POST /api/works/:workId/backup`.

## Decisions

- **Layout: a zip of per-work zips** (the dev's choice, 2026-10-18). Each work is `works/<slug>-<workId>.zip`, byte for byte what the per-work download would produce at that moment. The alternative, one zip with a folder per work, was rejected because it would be a second format for restore to read.
- **Entry point: Settings only** (the dev's choice, 2026-10-18). This is an account-level action, and Shelves stays uncluttered. The card's file list mentions `Shelves.jsx` and `export.js`. Neither changes: the new route lives in its own file and only borrows `exportBasename` from `export.js`.
- **Streaming:** the same approach as the per-work backup. The outer zip is piped straight into the response, and works are written one after another, each streamed into the outer archive as it's built. Bytes flow from the start and keep flowing, so the 100 s idle timeouts in nginx and Cloudflare never fire however many works there are (A3). Memory stays flat: at most one work's current entry is in flight.
- **Inner zips are stored, not compressed again** (`store: true` on the outer entry). They are already deflated, so compressing them again would waste CPU for no gain.
- **Consistency:** works are read one after another, not as a snapshot. A work edited during the download may land in the archive from just before or just after the edit. Each work stays internally consistent to the same degree as a per-work backup. This follows the limit the dev accepted for the per-work backup (2026-10-14). My call to carry it over.

## Archive layout

The download is named `scriptorium-backup-YYYY-MM-DD.zip`, using the UTC date.

| Entry | Contents |
|---|---|
| `works/<slug>-<workId>.zip` | One per owned work. Exactly what `writeWorkBackup` produces. `<slug>` is `exportBasename(work.title)` |
| `manifest.json` | Written last (see Manifest) |

Works are ordered by `createdAt` ascending, then `_id`, which gives a stable order (my call).

The work id in the file name means two works with the same title never collide.

## Manifest

```json
{
  "format": "scriptorium-account-backup",
  "formatVersion": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "works": [
    { "path": "works/my-novel-6acb….zip", "workId": "6acb…", "title": "My Novel", "bytes": 182044, "sha256": "…" }
  ]
}
```

- `works` has one item per inner zip, in archive order. `bytes` and `sha256` describe the inner zip file as stored.
- No user id or email goes in the manifest (my call). The archive identifies its works, not the account.
- Versioning follows the per-work rule: `formatVersion` goes up only for breaking changes, and added fields don't bump it. Each inner archive keeps its own `formatVersion`.
- An account with no works still gets a valid archive: just `manifest.json` with `"works": []` (my call). The button stays enabled.

## Endpoint and scoping

- New router `server/src/routes/accountBackup.js`, mounted in `server.js` as `app.use('/api/backup', auth, accountBackupRouter)`. I chose this over `/api/works/backup`, which sits under the works router, next to `/:workId`, and invites confusion with work ids.
- Works are queried with `Work.find({ ownerId: req.user.id })` and nothing else. Each work's data is then read by `workId` through the existing `workEntries`. This is the only owner check needed, because the list of works comes from the owner query (A2).
- Response: `200`, `Content-Type: application/zip`, `Content-Disposition` built by the same `contentDisposition()` helper the per-work route uses (move it to a shared spot, such as `routes/export.js` next to `exportBasename`), and `X-Accel-Buffering: no`. No `Content-Length`.
- The works list is read up front as a small array (`_id`, `title` and `createdAt` only, `.lean()`). Each full Work document is fetched by `writeWorkBackup`'s own entries as its turn comes. A long-lived works cursor was rejected because Mongo kills a cursor left idle for about 10 minutes between batches, and a large account's run can take longer than that (my call, raised by the builder check).
- The route reads no request body. The native download sends a urlencoded form POST, and the route ignores what it carries.

## Streaming pipeline

New function in `server/src/services/backupService.js`: `writeAccountBackup(works, output)`, where `works` is an iterable (sync or async) of lean Work documents carrying at least `_id` and `title`.

1. Create an outer `ZipArchive` and pipe it to `output`.
2. For each work: create a PassThrough, append it to the outer archive as `works/<slug>-<id>.zip` with `store: true`, passed through `measuring()` so its bytes and SHA-256 are recorded, then run `writeWorkBackup(work, passThrough)` and wait for both the inner write and the outer entry to finish before starting the next work.
3. After the last work, append `manifest.json`, then finalize.
4. Failure, from any work or from the outer archive: abort the inner and the outer archives, close the works cursor, and reject. The route then handles it the way the per-work route does: a JSON error if nothing was sent yet, otherwise log and `res.destroy(err)`, so a truncated archive never looks complete. One failing work fails the whole download (my call). A partial "everything" backup that looks complete would be worse than an error.
5. Client disconnect: the response's `close` must stop the run promptly. No further works are read, and the in-flight work's cursors are closed.

Changes to `writeWorkBackup` are allowed where nesting needs them (for example, how it detects that its output has gone away when the output is a PassThrough rather than the HTTP response). Its per-work behaviour and output bytes must not change, and the existing backup tests must keep passing unchanged.

## Download UI

`client/src/pages/Settings.jsx` gets a new `settings-section` titled "Backup", placed after the existing sections. It's always shown and doesn't depend on AI being on.

- Text: one line saying the archive holds a full backup of every work (chapters, history, plot threads, Codex and Map), one file per work, and no settings or API keys.
- **Native browser download** (the dev's choice, 2026-10-18, raised by the builder check). The button "Back up everything (.zip)" submits a hidden `<form method="POST" action="/api/backup">` that targets a hidden `<iframe>`, so the page doesn't navigate. The browser streams the file straight to disk and shows its own progress, and the archive never sits in the tab's memory. The `sid` cookie authenticates it. It's `SameSite=Lax`, so a cross-site form can't trigger the download. `api.download` (fetch, then a blob) was rejected because it holds the whole archive in memory and shows no progress until the last byte arrives.
- After submitting, the button is disabled for a few seconds and a line reads "Your download has started. Check your browser's downloads." (my call on the wording and timing). The page can't see how the download goes from here.
- Known limit: a failure before any bytes are sent (expired session, database down) lands in the hidden iframe, so nothing visible happens. A failure mid-stream shows as a failed download in the browser's download bar. The dev accepted errors appearing in the browser's UI rather than below the button. The silent pre-byte case is my reading of that choice, and is listed under "Calls to check".

## Error handling

- Not signed in: 401 from `requireAuth`.
- Failure before any bytes are sent (for example, the first works query fails): the normal JSON error response, with the download headers removed.
- Failure after bytes are sent: log, destroy the response. The browser marks the download as failed.

## Testing

- `accountBackup.routes.test.js` (in-memory Mongo, `server/test/support/http.js` and `support/zip.js`):
  - Owner with three works, another user with one: the archive has exactly three `works/*.zip` entries, one per owned work. Each inner zip unpacks to a valid per-work backup whose `manifest.json` `work.id` matches, and none of them belongs to the other user (A1, A2, A4).
  - Each inner zip equals what `writeWorkBackup` produces for that work on its own, compared through the unpacked entries, since inner `exportedAt` timestamps differ (A1).
  - Account manifest: one item per inner zip, with `bytes` and `sha256` matching the stored bytes, and `format`/`formatVersion` set.
  - Zero works: a valid archive with only `manifest.json` and `"works": []`.
  - No Settings text (`providers`, `apiKey`, the test key value) anywhere in the archive.
- `backupService` unit tests with fake work sources:
  - The first bytes reach the output before the last work is read, which is the automated part of A3.
  - A failing work rejects, aborts the archive, and stops further works from being read.
  - A client disconnect mid-run stops further works from being read.
- A3 evidence: a timed run in WSL on a generated account (about 30 works, a mix of sizes, with history), recorded on the card. It is not in CI, since timing tests are flaky.
- Route test: a urlencoded form POST (as the hidden form sends) gets the same zip as an empty JSON POST.
- Settings client test (linkedom): the Backup section renders, the form posts to `/api/backup` with method POST and targets the hidden iframe, and clicking the button submits it, disables the button and shows the "download has started" line.

No new dependencies: `archiver` and `yauzl` are already in place.

## Acceptance mapping

| Criterion | Proof |
|---|---|
| A1 single archive, one complete work backup per owned work | Route test: one inner zip per owned work, each matches a standalone per-work backup |
| A2 only the signed-in writer's works | Route test: the other user's work is absent |
| A3 many works without timing out | Streaming unit test (first bytes before the last work is read); timed WSL run on ~30 works recorded on the card |
| A4 tests check one entry per owned work | Route test counting `works/*.zip` entries against owned works |

## Left to the builder

- Exactly how to wire inner-to-outer stream completion and abort in archiver 8, within the rules above.
- Where the shared `contentDisposition()` helper ends up.
- The exact wording of the Settings text, within the content given above.

## Calls to check

Calls I made that the dev didn't explicitly decide:
- One failing work fails the whole download, rather than skipping it.
- An empty account gets an archive with just the manifest, and the button stays enabled.
- The new route is `POST /api/backup`, not `/api/works/backup`.
- No user id or email goes in the account manifest.
- Works are ordered by `createdAt`.
- The work list is read up front, to avoid Mongo's idle-cursor timeout.
- A failure before any bytes are sent is silent in the UI (see Download UI).
- Writes during the download aren't isolated, the same limit as the per-work backup.
