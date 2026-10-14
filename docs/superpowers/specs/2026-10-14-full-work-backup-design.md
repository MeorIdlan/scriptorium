# Full work backup: design

- Card: https://trello.com/c/pGlKhyOg (Download a full backup of one work)
- Epic: https://trello.com/c/OCQSvfai (Export and backup)
- PRD: FR-20, NFR-2, G-2; Q-3 decided here (see Decisions)
- Date: 2026-10-14
- Track: architectural

## Goal

A writer downloads one archive that holds all of one work's data, plus a versioned machine-readable manifest. The archive is the safety net for G-2 (zero data loss) and the input that MVP 2 restore will read (FR-26). It is a complete copy of the work, not a manuscript. Manuscript export (FR-19) is unchanged.

## Scope

In:
- `POST /api/works/:workId/backup`, owner only, streams a zip.
- Contents: the Work document's own fields, chapters (HTML and Markdown), scenes, Codex, Map, catches, plot threads, milestones and all snapshots.
- A `manifest.json` that lists every entry with its size, record count and SHA-256.
- A "Full backup (.zip)" option in `ExportModal`.

Out (other cards):
- Whole-account backup (EJUXWYvS, FR-21). It reuses this endpoint's pieces but is a separate story.
- Reminder (HtAIjidq, FR-22; Q-4 is open there).
- Restore (QTpL7b2y, FR-26, MVP 2). This spec only fixes the format it will read.

Not included in the archive:
- The per-user `Settings` document, which holds the AI key and the provider config.
- `DailyProgress` (per writer, not per work), `Session` rows (writing-session history), and the auth models.
- Other users' data of any kind.

## Decisions

- **Q-3 (archive format and manifest version): a ZIP of JSON files, `formatVersion` 1.** Readable without the app, and it can be written one entry at a time. The alternatives were a single JSON file (the whole work in memory, weakens A4) and a ZIP of NDJSON (harder to read by hand, no real gain).
- **Streaming:** entries are streamed straight into the HTTP response. Memory stays flat and bytes flow from the start, which keeps the nginx and Cloudflare idle timeouts (100 s) from firing. The alternatives were a temp file (double disk writes, nothing sent until the build finishes) and building in memory (fails A4).
- **Markdown:** a small converter for the tags the editor's sanitiser lets through, with no new dependency. A general HTML-to-Markdown library was rejected because its output can change between versions, and this file is meant to last.
- **Consistency:** the reads are not one transaction. A save during the download can leave a chapter and its snapshots from slightly different moments. Each document is internally consistent. The dev accepted this limit (2026-10-14).

## Archive layout

The download is named `<slug>-backup-YYYY-MM-DD.zip`, using `exportBasename()` from `routes/export.js` and the UTC date.

| Entry | Contents |
|---|---|
| `work.json` | The Work document's fields, without `ownerId` and internal fields |
| `chapters.json` | Chapter metadata: id, number, title, order, status, notes, wordCount, threadIds, summary |
| `chapters/<chapterId>.html` | `contentHtml`, the source of truth, scene markers intact |
| `chapters/<chapterId>.md` | Markdown from `chapterMarkdown.js` (see Markdown) |
| `scenes.json` | Scene cards per chapter, from the stored `Chapter.scenes` |
| `codex.json` | The Codex document |
| `map.json` | The Map document |
| `catches.json` | All catches for the work |
| `threads.json` | Plot threads |
| `milestones.json` | Milestones, with their chapter entries and snapshot ids |
| `snapshots.json` | All snapshots for the work, one JSON array |
| `manifest.json` | Written last (see Manifest) |

Records use the shape the API returns: `id` in place of `_id`, and no `__v`. Restore can reuse the same parsing.

Chapter file names use the chapter id, so there are no collisions and no slug to get wrong. The manifest maps ids to paths.

## Manifest

`manifest.json` is written last, so it can carry the size and hash of every entry.

```json
{
  "format": "scriptorium-work-backup",
  "formatVersion": 1,
  "exportedAt": "2026-10-14T12:00:00.000Z",
  "work": { "id": "…", "title": "…" },
  "items": [
    { "path": "work.json", "kind": "work", "count": 1, "bytes": 812, "sha256": "…" },
    { "path": "chapters/<id>.html", "kind": "chapter-html", "chapterId": "…", "count": 1, "bytes": 9120, "sha256": "…" }
  ]
}
```

- `kind` is one of: `work`, `chapters`, `chapter-html`, `chapter-markdown`, `scenes`, `codex`, `map`, `catches`, `threads`, `milestones`, `snapshots`, `manifest`.
- `count` is the number of records in the entry (1 for single documents).
- Every zip entry except `manifest.json` appears in `items`.

Versioning: `formatVersion` goes up only for breaking changes (a removed or renamed field, a changed meaning). Added fields do not bump it. Restore refuses a `formatVersion` higher than it knows and warns on an unknown `kind`.

## Endpoint and scoping

- `POST /api/works/:workId/backup`, mounted like the export route, behind `requireAuth`, with `loadWork` as the owner check. A non-owner gets 404 (A3).
- Every collection is queried by `workId` only, after `loadWork` has confirmed ownership.
- Response: `200`, `Content-Type: application/zip`, `Content-Disposition` with the filename, and `X-Accel-Buffering: no`. The client's nginx has no `proxy_buffering off`, so this header stops nginx from holding the stream. There is no `Content-Length`, since the size is not known up front.
- Reads use Mongo cursors (`.lean().cursor()`), sorted by chapter order. Snapshots are never loaded all at once.

## Streaming pipeline

New module `server/src/services/backupService.js`:

1. `streamWorkBackup(workId, res)` creates an `archiver` zip (zip format) and pipes it to `res`.
2. Each entry is a Readable built from an async generator that reads one collection. JSON arrays (`chapters.json`, `snapshots.json`, and the rest) are written by hand: `[`, then the items joined by `,`, then `]`. No array is held in memory.
3. Each entry passes through a SHA-256 transform, which records its byte count and hash as it's written.
4. After the last entry, `manifest.json` is appended from the recorded values.
5. Failure: an archiver `error` is logged and the response is destroyed, so a truncated zip never looks complete. A client disconnect calls `archiver.abort()`, which stops the reads.

`exportService.js` is not changed.

## Markdown

New module `server/src/services/chapterMarkdown.js`. It converts `contentHtml` (the sanitiser's allowed tags only) to Markdown:

| HTML | Markdown |
|---|---|
| `p`, `div` | a paragraph, separated by a blank line |
| `br` | a backslash line break |
| `h1`, `h2`, `h3` | `#`, `##`, `###` |
| `b`, `strong` | `**…**` |
| `i`, `em` | `*…*` |
| `u` | the text only (underline has no Markdown form; `.html` keeps it) |
| `span`, `font` | the text only |
| `blockquote` | a `> ` prefix on each line |
| `hr` (scene marker) | `* * *`, the same break the existing export uses |

- Text is escaped where it would otherwise become Markdown (`*`, `_`, `#` at line start, `-`/`+` at line start, `[`, `]`, `` ` ``, `\`, `<`).
- Entities are decoded with `htmlparser2`, which the server already depends on.
- Scene cards are not written into the Markdown. They are in `scenes.json`.

## Download UI

`client/src/components/overlays/ExportModal.jsx` gets a separate "Full backup (.zip)" section below the format picker. Its text says the archive is a full copy of the work (chapters as HTML and Markdown, history, milestones, plot threads, Codex and Map), not a manuscript.

- The button calls `api.download` on `/works/:workId/backup` and saves the blob the same way the export does.
- While it runs, the button reads "Preparing backup…" and is disabled.
- A truncated stream makes the fetch reject, so the modal shows an error and saves nothing.

## Error handling

- Non-owner: 404 from `loadWork`.
- Work not found: 404.
- Read or write failure before any bytes are sent: the route returns the normal error response.
- Failure after bytes are sent: log, destroy the response, and let the client's fetch reject. A partial archive is never reported as complete.

## Testing (A5)

- `chapterMarkdown.test.js`: each row of the mapping table, the escaping cases, entity decoding, and underline dropped.
- `backupService.test.js`: entries stream from fake cursors; manifest `bytes` and `sha256` match the written entries; `items` covers every entry except the manifest.
- `backup.routes.test.js` (in-memory Mongo, `server/test/support/http.js`):
  - round trip: the archive, read back with `yauzl`, matches the work in the database (A1, A2);
  - another user's work returns 404 (A3);
  - the zip has no `providers`, `apiKey` or other Settings text (A3);
  - a fake cursor proves the first bytes are written before the last snapshot is read (the automated part of A4).
- A4 evidence: a timed run on a generated ~150k-word work with history, in WSL, recorded on the card. It is not in CI, since timing tests are flaky.
- `ExportModal` client test (linkedom): the backup section renders and calls the backup path.

New dependencies:
- `archiver` (server, runtime).
- `yauzl` (server, dev, for reading the archive back in tests).

## Acceptance mapping

| Criterion | Proof |
|---|---|
| A1 archive contents | Round-trip test; chapter, scene, Codex, Map, catch, thread, milestone and snapshot entries |
| A2 manifest | Manifest test: every entry listed with matching size and SHA-256 |
| A3 owner only, no AI key | 404 test for a non-owner; no-Settings-text test |
| A4 large work | Streaming test (automated); timed WSL run recorded on the card |
| A5 tests check contents | Round-trip test and unit tests above |

## Open items

- None for this card. Q-4 (reminder) and the restore format details belong to their own cards.
