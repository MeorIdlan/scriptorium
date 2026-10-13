# Plot-thread tagging: design

Story: tag scenes and chapters with plot threads (FR-15). Builds on "Define plot threads for a work" (PR #11).

## Goal

The writer marks where each plot thread moves forward, on scenes and on chapters (Q-1). Tags survive save, reload, scene moves, snapshot restore and bringing a chapter back, and never revive a deleted thread's id. Tags show as coloured markers in the Scenes tab.

## Existing pieces (from PR #11)

- Scene tags: `data-threads="thr_a thr_b"` on the `<hr data-scene>` marker. The sanitiser keeps it; server `sceneMarkers.js` and client `utils/scenes.js` expose `threadIds`.
- Chapter tags: `Chapter.threadIds` (`[String]`). The chapter PUT drops `threadIds` on purpose, so a stale autosave can't overwrite tags.
- `threadTags.js`: `THREAD_ID`, `MAX_TAGS`, `parseThreadIds`, `knownThreadIds` (unused in production), `stripThreadFromHtml`.
- Deleting a thread strips its id from live chapters (tags and HTML); snapshots are left as history.

## Decisions

- **Chapter write path:** a dedicated endpoint, not the autosave PUT (dev approved, approach 1). The autosave PUT keeps ignoring `threadIds`.
- **Chapter tag UI:** a "Chapter threads" chip strip at the top of the Scenes tab, for the open chapter (dev chose).
- **Snapshots carry chapter tags:** `Snapshot.threadIds`, so bringing a deleted chapter back from a milestone restores its chapter tags.
- **Strays are filtered on write**, not only on read: every path that writes tags or HTML filters to the work's current thread ids.

## Server

### Write endpoint (S1)

`PUT /api/works/:workId/chapters/:chapterId/threads`, behind `loadWork`, body `{ threadIds: string[] }`.

- 400 `INVALID_FIELD` when `threadIds` isn't an array of strings, an id fails `THREAD_ID`, or the array is longer than `MAX_TAGS`.
- Dedupes, then filters to the work's existing threads with `knownThreadIds`. Unknown ids are dropped without an error (a thread delete may have raced the request).
- 404 `NOT_FOUND` for a chapter outside the work.
- Writes only `threadIds`, with `timestamps: false`, so tagging doesn't change `lastEditedAt`. Responds with the chapter in the usual response shape.

### Filtering HTML tags

New `filterHtmlThreads(html, knownSet)` in `threadTags.js`: keeps only known ids in `data-threads` on `<hr>` markers, drops the attribute when none remain, and leaves the rest of the HTML byte-identical (same approach as `stripThreadFromHtml`).

Applied after sanitising and before `sceneSummaries` in: the chapter PUT, `writeMovedChapter` (scene move), `restoreFromSnapshot`, and milestone restore / bring-back. Each request loads the work's thread ids once.

### Survival (S3)

- `Snapshot` gets `threadIds: [String]`, captured from the chapter's tags by `takeAutoSnapshot`, named snapshots and milestone snapshots.
- `restoreFromSnapshot` sets `Chapter.threadIds` from the snapshot (filtered to known threads) and filters the restored HTML tags. A snapshot without the field (older data) leaves the live chapter's tags unchanged. A chapter recreated from such a milestone comes back with no chapter tags.
- Scene moves need no tag logic: the marker carries its `data-threads`. The write-side filter still applies.

## Client

### Scenes tab (S2, A1, A3)

- "Chapter threads" strip above the scene list: one chip per work thread (from `ActiveWorkContext` `threads`), toggled on click, in the thread's colour. Calls the new endpoint, then `refreshChapters`. Resolved threads stay selectable but are muted. A work with no threads shows a hint to define them on the Map.
- Scene card form (`SceneRow` edit mode) gets the same chip toggles; they save through `onSave` → `writeSceneCard` with `threadIds`.
- Each scene row shows small coloured markers for its tags, with the thread name as the tooltip. Ids that aren't current threads aren't rendered.

### Utilities

- `markerHtml` and `applyCard` in `utils/scenes.js` normalise `threadIds` with `Array.isArray` before joining. `applyCard` still only touches `data-threads` when `'threadIds' in fields`, so card edits that omit it keep tags.
- After a thread delete, the client refreshes `state.chapters` (it holds the stripped ids otherwise) and the open chapter's content, so the editor can't save the removed tag back.

## Tests (S4, A4)

Server (DB-backed, run in WSL):
- Endpoint: valid set and clear, invalid body, stray ids dropped, foreign chapter 404, `lastEditedAt` untouched.
- Autosave PUT ignores `threadIds`; scene tags in saved HTML are filtered to known threads.
- Scene move between chapters keeps tags; same-chapter move keeps tags.
- Snapshot restore: chapter and scene tags come back, a deleted thread's id doesn't; old snapshot without `threadIds` leaves live tags.
- Milestone bring-back of a deleted chapter restores chapter and scene tags.

Client (linkedom):
- Chapter and scene chip toggles set and clear tags; markers render with the thread colour; unknown ids aren't shown.
- `markerHtml`/`applyCard` accept non-array `threadIds`.
- Chapters refresh after a thread delete.

## Criteria coverage

- A1: chapter strip + scene card chips; endpoint and `writeSceneCard` tests.
- A2: server survival tests (save/reload, move, restore, bring-back).
- A3: Scenes tab marker rendering test.
- A4: the test list above.

## Out of scope

Map lanes and gaps (card n42cxynp), AI story context (card 6qDm9tVb), tagging from the Map.
