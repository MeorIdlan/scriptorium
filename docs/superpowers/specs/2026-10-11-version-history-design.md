# Version History (compare, named snapshots, milestones) — Design

Date: 2026-10-11

## Purpose

Today each chapter keeps up to 50 automatic snapshots inside the chapter
document (`draftHistory`), one at most every 10 minutes, and the History
modal can preview one as plain text and restore it. The writer can't see
what changed between versions, can't mark a version worth keeping (the
oldest is silently dropped after 50), and can't capture the whole book at a
point in time ("draft 1 done", "sent to beta readers").

This design adds:

- **Compare**: a word-level diff between any version and the current text,
  or between any two versions.
- **Named snapshots** that are never pruned.
- **Whole-work milestones**: a named capture of every chapter, a per-chapter
  "what changed since" view, and per-chapter restore, including bringing
  back chapters deleted since.
- **Thinned retention** for automatic snapshots instead of a hard cap of 50.

This is the second half of step 3 of the feature-gap roadmap (Polish review
was the first).

## Decisions

| Question | Decision |
|---|---|
| Scope | Compare versions, named snapshots, whole-work milestones. No partial (paragraph) restore. |
| Retention of automatic snapshots | Keep all from the last 24 h, then the newest per calendar day up to 30 days, then the newest per calendar week. Named and milestone snapshots are always kept. |
| Milestones | Compare + restore per chapter; deleted chapters can be brought back. No one-click rollback of the whole book. |
| Storage | Snapshots move out of the chapter into their own `Snapshot` collection, plus a `Milestone` collection. |
| Compare targets | A version against the current text, or any two versions. |

## Data model

### `Snapshot` (new, `server/src/models/Snapshot.js`)

```js
{
  _id: String,              // 'snap_<Date.now()>_<rand3>'; migrated: 'snap_<chapterId>_<savedAt ms>'
  workId: String,           // required, indexed
  chapterId: String,        // required
  chapterTitle: String,     // chapter title when taken
  kind: 'auto' | 'named' | 'milestone',
  name: String,             // writer's name (named); '' otherwise
  note: String,             // system label, e.g. 'Before restore'; '' otherwise
  milestoneId: String,      // set when kind === 'milestone', else null
  content: String,          // plain text
  contentHtml: String,      // sanitized HTML
  wordCount: Number,
  createdAt: String,        // ISO timestamp
}
```

Indexes: `{ chapterId: 1, createdAt: -1 }`, `{ milestoneId: 1 }`, `{ workId: 1 }`.
`toJSON` uses the shared `idTransform`.

### `Milestone` (new, `server/src/models/Milestone.js`)

```js
{
  _id: String,              // 'ms_<Date.now()>_<rand3>'
  workId: String,           // required, indexed
  name: String,
  createdAt: String,
  chapters: [{ chapterId, title, order, snapshotId, wordCount }],  // _id: false
}
```

### `Chapter`

`draftHistory` and its sub-schema are removed after migration (see below).
The chapter list, reorder and create routes stop mentioning it.

## Automatic snapshots and thinning

- **When:** unchanged from today. On `PUT /chapters/:id`, when the text or
  HTML changed, the chapter already had text, and the newest `auto` snapshot
  of that chapter is ≥ 10 minutes old (or there is none), the *previous*
  text is saved as an `auto` snapshot. The "newest auto snapshot" is one
  indexed query. Named and milestone snapshots don't reset the 10-minute
  clock.
- **Restore** always saves the current text first as `auto` with note
  `Before restore`, regardless of the 10-minute rule.
- **Thinning** runs after each new `auto` snapshot, for that chapter only.
  `thinSnapshots(snapshots, now)` in `server/src/services/snapshotRetention.js`
  (pure) takes `[{ id, kind, createdAt }]` and returns the ids to delete:
  - only `kind === 'auto'` entries are considered;
  - age < 24 h: keep all;
  - 24 h ≤ age < 30 days: group by UTC calendar day (`floor(t / 86400000)`),
    keep the newest per group;
  - age ≥ 30 days: group by calendar week (`floor(t / 604800000)`), keep the
    newest per group.
  - Groups are fixed calendar buckets, so a snapshot that survives thinning
    isn't later replaced just because time moved; an entry only becomes
    deletable when it crosses into an older tier and shares a bucket with a
    newer kept entry.
- Thinning failure is logged and does not fail the save.

## Migration

`server/src/services/snapshotMigration.js`, run once at startup after Mongo
connects (`server.js`), before the server listens:

1. For each chapter with a non-empty `draftHistory`:
   `snapshotsFromDraftHistory(chapter)` (pure) maps each entry to an `auto`
   snapshot with id `snap_<chapterId>_<Date.parse(savedAt)>`,
   `content = contentSnapshot`, `contentHtml = htmlSnapshot`,
   `createdAt = savedAt`, `chapterTitle = chapter.title`. Entries with an
   unparseable `savedAt` are skipped.
2. Upsert them (`bulkWrite` with `updateOne … upsert: true`, `$setOnInsert`),
   so a re-run after a crash is safe.
3. Only after the upserts succeed, `$unset` that chapter's `draftHistory`.
4. A failure for one chapter is logged; that chapter keeps its
   `draftHistory` and is retried on the next start. The server still starts.

The migration reads through the raw collection (`Chapter.collection`), since
the field is no longer in the schema.

## Server API

All routes sit under `requireAuth()` and `loadWork`; every `Snapshot` and
`Milestone` query also filters by `workId`, so another writer's ids 404.

Name rule (named snapshots and milestones): trimmed; empty → `400
MISSING_FIELD`; over 80 characters → `400 TOO_LONG`. Shared helper
`validateName(name)` in `server/src/services/snapshotNames.js` returns the
trimmed name or throws an `httpError`.

### Chapter snapshots — `server/src/routes/snapshots.js`

Mounted at `/api/works/:workId/chapters/:chapterId/snapshots`
(`Router({ mergeParams: true })`). Each route first checks the chapter
exists in the work (404 otherwise).

| Route | Behaviour |
|---|---|
| `GET /` | `[{ id, kind, name, note, milestoneId, milestoneName, wordCount, createdAt }]`, newest first, no text. `milestoneName` is looked up from `Milestone` for milestone snapshots. |
| `GET /:snapId` | Full snapshot including `content` and `contentHtml`. |
| `POST /` `{ name }` | Saves the chapter's current text as `kind: 'named'`. Returns the snapshot (no text). |
| `PATCH /:snapId` `{ name }` | `named` → rename. `auto` → becomes `named` with that name (kept forever). `milestone` → `400 NOT_ALLOWED`. |
| `DELETE /:snapId` | `named` only → 204. `auto`/`milestone` → `400 NOT_ALLOWED`. |
| `POST /:snapId/restore` | Saves the current text as `auto` with note `Before restore` (then thins), sets the chapter's `content`, `contentHtml`, `wordCount`, `updatedAt` from the snapshot, recalculates the work's word count. Returns the updated chapter. |

The old `POST /api/works/:workId/chapters/:chapterId/restore` route is
removed.

### Milestones — `server/src/routes/milestones.js`

Mounted at `/api/works/:workId/milestones`.

| Route | Behaviour |
|---|---|
| `GET /` | `[{ id, name, createdAt, chapterCount, wordCount }]`, newest first (`wordCount` = sum of its chapters' words). |
| `POST /` `{ name }` | Creates one `milestone` snapshot per chapter (`insertMany`), then the `Milestone` with `chapters` in current `order`. Returns the list-row shape. A work with no chapters gives an empty milestone. |
| `GET /:id` | `{ id, name, createdAt, chapters: rows }` — see below. |
| `POST /:id/chapters/:chapterId/restore` | If the chapter exists: same as snapshot restore (with `Before restore`). If it was deleted: recreate it with its **original id**, title from the milestone, text from the snapshot, `order` = after the last chapter, `number` = chapter count + 1, `status: 'draft'`, then update the work's `chapterCount` and recalculate words. Returns `{ chapter, recreated }`. 404 if the chapter isn't in the milestone. |
| `PATCH /:id` `{ name }` | Rename. |
| `DELETE /:id` | Deletes the milestone and its snapshots → 204. |

**Comparison rows** (`GET /:id`): one row per chapter in the milestone or
in the work today, ordered by today's order, with deleted chapters after
in their milestone order:

```js
{ chapterId, title, state, snapshotId, wordsThen, wordsNow, added, removed }
```

- `state`: `unchanged` (plain text identical), `changed`, `deleted` (in the
  milestone, not in the work), `new` (in the work, not in the milestone).
- `title`: today's title, or the milestone's for deleted chapters.
- `added`/`removed` come from `diffStats(then, now)`; for `deleted` they are
  `0` / `wordsThen`, for `new` `wordsNow` / `0`. `snapshotId` is `null` for
  `new`.

### Word statistics — `server/src/services/textDiff.js` (pure)

`diffStats(before, after)` → `{ added, removed }` in words:

1. Split both texts into paragraphs on `\n`; trim a shared prefix and suffix
   of identical paragraphs.
2. LCS over the remaining paragraphs (compared exactly).
3. For each run of unmatched paragraphs between matches, word-level LCS
   between the run's removed and added text (words split on whitespace);
   unmatched words count as removed/added. If a run's word product exceeds
   4,000,000, count all its words as removed/added instead.

A one-word edit counts as +1/−1, not a whole paragraph.

### Cleanup

- `DELETE /chapters/:id` also deletes that chapter's `auto` and `named`
  snapshots; its `milestone` snapshots stay so it can be brought back.
- `deleteWorkCascade` also deletes the work's snapshots and milestones.

## Client

Both modals render through `createPortal(…, document.body)` (the Quill
panel's tab animation leaves a transform that traps fixed overlays).

### ⟲ History — `client/src/components/overlays/ChapterHistoryModal.jsx`

Replaces `DraftHistoryModal.jsx` and its `draft-history-*` CSS; opened from
the same toolbar button.

- **Version list (left):** "Current text" first, then snapshots newest
  first, grouped under day headings (Today, Yesterday, then the date). Each
  row shows the time and word count; `auto` rows show their `note` if any,
  `named` rows `★ name`, milestone rows `◆ milestone name`.
- **Comparison (right):** the selected version against **Compare with**
  (a select: "Current text" by default, or any other version). Header
  `+120 words · −45 words`. Removed words struck through (`.polish-del`),
  added words highlighted (`.polish-add`). Unchanged stretches collapse to
  "… 14 unchanged paragraphs", expandable on click. A **Changes / Full
  text** toggle shows the selected version plainly. Identical plain text
  shows "No text changes (formatting changes aren't shown)."
- **Actions:**
  - **Restore this version** — a confirm step: "Your current text will be
    saved as a snapshot first." Then `POST …/snapshots/:id/restore`; the
    editor updates with `replaceContent(content, contentHtml)`.
  - **Keep this version…** (on `auto`) — inline name field → `PATCH`.
  - **Rename** / **Delete** (on `named`; delete has a confirm step).
  - Footer **Save snapshot…** — inline name field → `POST`.
- Texts are fetched per version on demand (`GET …/snapshots/:id`) and
  cached in the modal. "Current text" is the editor's current content.

### ◆ Milestones — `client/src/components/overlays/MilestonesModal.jsx`

Opened from a **◆ Milestones** button in the Main Room chapter sidebar
header.

- **List:** milestones newest first with date, chapter count, words.
  **New milestone** with a name field defaulting to
  `Milestone — 11 Oct 2026` (today's date, `en-GB` format).
- **Selected milestone:** a row per chapter: title, state badge (Changed /
  Unchanged / Deleted since / New since), words then → now, `+added /
  −removed`. Row actions:
  - **Compare** — the same comparison view (shared component) showing the
    milestone version against the chapter's current text.
  - **Restore chapter** (changed) / **Bring back** (deleted), each with a
    confirm step. If the restored chapter is open in the editor, the editor
    updates via `replaceContent`. The chapter list in `ActiveWorkContext`
    is refreshed afterwards.
- **Rename** and **Delete** (confirm) for the selected milestone.

### Shared pieces

- `client/src/components/overlays/VersionDiff.jsx` — renders a comparison
  from two plain texts (used by both modals).
- `client/src/utils/historyDiff.js` (pure):
  - `buildHistoryDiff(before, after)` → `{ segments, added, removed,
    paragraphLevel }`. Uses `diffSentences` + `diffWords` from
    `polishDiff.js`. Each segment is `{ type: 'equal', text }` or
    `{ type: 'change', parts: [{ type: 'same'|'del'|'add', text }] }`.
    If (sentences before × sentences after) exceeds 4,000,000, it diffs
    whole paragraphs instead and sets `paragraphLevel: true` (the view
    says "Showing paragraph-level changes").
  - `collapseUnchanged(segments, context = 1)` → equal segments longer
    than `2 × context + 1` paragraphs are split into a head, a
    `{ type: 'collapsed', text, paragraphs }` middle, and a tail, keeping
    `context` paragraphs next to each change (the first/last segment keeps
    only the side next to a change).
  - `added`/`removed` count words in `add`/`del` parts.
- Client API calls go through `api.js`; errors show inline in the modal.

## Errors

| Situation | Behaviour |
|---|---|
| Snapshot / milestone / chapter not found, or in another work | `404 NOT_FOUND` |
| Name missing or blank / over 80 characters | `400 MISSING_FIELD` / `400 TOO_LONG` |
| Rename/delete a milestone snapshot, delete an auto snapshot | `400 NOT_ALLOWED` |
| Thinning throws | Logged; the save still succeeds |
| Migration fails for a chapter | Logged; its `draftHistory` kept and retried next start; server starts |
| "Bring back" for a chapter that exists again | Normal restore of that chapter |
| Restoring the chapter open in the editor | Editor updated via `replaceContent`; autosave stores it |
| Very large comparison | Paragraph-level fallback, labelled |
| Milestone on a work with no chapters | Allowed (empty) |
| Double clicks | Action buttons disabled while a request runs |

## Testing

- **Server (`npm --prefix server test`):**
  - `thinSnapshots`: all kept under 24 h; newest per day 1–30 days; newest
    per week after 30 days; named/milestone never returned; a kept entry
    stays kept when `now` advances a day; empty input.
  - `diffStats`: identical → 0/0; one-word edit → 1/1; paragraph added;
    paragraph removed; empty before; empty after; repeated paragraphs.
  - `snapshotsFromDraftHistory`: deterministic ids, field mapping, skips
    bad dates.
  - `validateName`: trims, blank, 80 vs 81 characters.
- **Client (`npm --prefix client test`):**
  - `buildHistoryDiff`: identical, one-word edit counts, paragraph added,
    paragraph-level fallback.
  - `collapseUnchanged`: context kept around a change, short runs not
    collapsed, leading/trailing runs.
- **End to end** (fake provider, throwaway Mongo on 27018): an API script
  for migration of seeded `draftHistory`, named snapshots and promotion,
  `Before restore`, milestone create / compare / restore / bring back,
  chapter delete keeping milestone snapshots, work delete removing
  everything, and another work's ids → 404; then a browser pass through
  both modals.

## Out of scope

- Restoring individual paragraphs.
- One-click rollback of the whole book to a milestone.
- Showing formatting-only changes in the diff.
- Storing differences instead of full copies.
- Exporting a milestone.
