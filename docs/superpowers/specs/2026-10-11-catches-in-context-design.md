# Catches in context — design

Step 4 of the roadmap ("Scenes, plot threads, and catches shown in context") is
split into three features. This spec covers the first: **catches in context**.
Scenes and plot threads get their own specs later.

## Problem

A catch is an idea captured mid-writing (Ctrl+Shift+I). Today catches are
write-only in practice:

- The Catch tab lists open catches with the raw chapter id (`→ ch_abc`), cut to
  60 characters. The only actions are Mark used and Discard.
- Nothing brings a catch back when the writer opens the chapter it was tagged to.
- A catch can't be edited, retagged, searched, reopened, inserted into the text,
  or turned into a Codex entry or Map note.
- Catches never reach the AI, so hooks, the Rekindler and editor review ignore them.
- `PUT /catches/:id` spreads `req.body` into `$set`, so a client can overwrite any
  field (`createdAt`, `capturedDuringChapterId`, arbitrary keys).
- Deleting a chapter leaves catches tagged to a chapter that no longer exists.

## Goals

1. Catches tagged to the open chapter are visible without interrupting writing.
2. A catch can be edited, retagged, searched, reopened, inserted at the cursor, or
   turned into a Codex character / place / rule or a chapter's Map note.
3. Open catches tagged to the current chapter feed the AI story context.

## Decisions (made with the dev)

| Question | Decision |
|---|---|
| Which part of step 4 first | Catches in context |
| How catches surface | Quiet: a count on the Catch tab label and a dot in the chapter list; the tab lists "For this chapter" first. No strip above the editor. |
| Actions | Edit/retag/search, insert at cursor, turn into Codex entry or Map note, feed to the AI — all four |
| Architecture | Approach 1: the client composes conversions from the existing Codex and Map endpoints; the server hardens catch writes and adds catches to the context packet |
| Insert position | A new paragraph after the cursor's paragraph, not mid-sentence |

## Data

`Catch` (existing collection, no migration):

| Field | Change |
|---|---|
| `_id` | New ids are `catch_<Date.now()>_<8 hex>` (like snapshot ids). Old 5-character ids stay valid. |
| `content` | Required, trimmed, 1–2,000 characters. |
| `taggedChapterId` | A chapter id of this work, or `null`. |
| `status` | `open` \| `used` \| `discarded` (validated). |
| `usedAs` | **New.** `{ kind, refId, label } \| null`. `kind` ∈ `insert`, `codex-character`, `codex-place`, `codex-rule`, `map-note`. `refId` is a string ≤ 100 chars, `label` a string ≤ 120 chars. |

Old catches have no `usedAs`; it reads as `null`.

## Server

### `services/catchFields.js` (new, pure)

- `MAX_CATCH_LENGTH = 2000`, `CATCH_STATUSES`, `USED_AS_KINDS`.
- `catchUpdate(body)` → `{ ok: true, set, unset } | { ok: false, field, message }`.
  - Takes only `content`, `taggedChapterId`, `status`, `usedAs` from `body`; every
    other key is ignored.
  - `content`: must be a string, trimmed, non-empty, ≤ 2,000 chars.
  - `taggedChapterId`: a string or `null` (`''` means `null`). Whether the chapter
    belongs to the work is checked by the route, not here.
  - `status`: one of `CATCH_STATUSES`.
  - `usedAs`: `null`, or an object with a valid `kind`, string `refId` and
    `label` within their limits; extra keys are dropped.
  - When `status` is `open`, `usedAs` is cleared (`unset`), whatever the body says.
- `newCatchId()`.

### `routes/catches.js`

- `POST /` validates `content` and `taggedChapterId` with the same rules; 400 with
  `code: 'INVALID_FIELD'` on bad input. `capturedDuringChapterId` is kept only if it
  is a chapter of this work, otherwise `null`.
- `PUT /:catchId` uses `catchUpdate`; 400 on bad input. A non-null
  `taggedChapterId` must be a chapter of this work (`Chapter.exists({ _id, workId })`),
  else 400. Sets `updatedAt`.
- `GET /` and `DELETE /:catchId` are unchanged.

### `routes/chapters.js`

`DELETE /:chapterId` also runs
`Catch.updateMany({ workId, taggedChapterId: chapterId }, { $set: { taggedChapterId: null } })`
so those catches become untagged.

### Story context

- `buildContext` accepts `needs.catches`. When set and a current chapter of this work
  is known, it loads open catches with `taggedChapterId` = that chapter, newest first,
  at most 10.
- `formatContextBlock` gains a `catches` input and renders, after the Map section:

  ```
  ## Writer's notes for this chapter
  - She lies about the letter
  ```

  Each note is whitespace-collapsed to one line and clipped to 300 characters.
- The manifest gets `catches: <count sent>`; `ContextUsed` shows
  "N writer's note(s)".
- Routes that pass `catches: true`: **hooks**, **rekindler**, **editor-review**.
  Not polish-draft (its rules forbid adding events). Not beat-suggest: it has no
  client caller and no chapter.

## Client

### `utils/catchGroups.js` (new, pure)

- `chapterLabel(chapter)` → `"Ch. 3 — The Well"` (`Untitled` when blank).
- `filterCatches(catches, { status, query, chapters })`: `status` is `open` /
  `used` / `discarded` / `all`. `query` matches catch text or the tagged
  chapter's title, case-insensitive, trimmed; blank matches everything.
- `groupCatches(catches, chapters, currentChapterId)` →
  `[{ key, title, items }]` in this order: `this` ("For this chapter"),
  `untagged` ("Untagged"), then one group per other chapter in book order (title =
  `chapterLabel`). A tag pointing at a chapter not in `chapters` goes in
  `untagged`. Items newest first. Empty groups are omitted.
- `openCountsByChapter(catches)` → `Map<chapterId, number>` of open, tagged catches.
- `timeAgo(iso, now)` → `"just now"`, `"5 min ago"`, `"3 h ago"`, `"2 d ago"`, or a
  short date after 30 days.

### `utils/catchActions.js` (new; takes `api` as a parameter)

- `markUsed(api, workId, catchItem, usedAs)` → PUT `{ status: 'used', usedAs }`.
- `reopen(api, workId, catchItem)` → PUT `{ status: 'open' }`.
- `useAsCodex(api, workId, catchItem, { type, name, text })`: `type` ∈ `character`,
  `place`, `rule`. POSTs to `/codex/characters` (`{ name, notes: text }`),
  `/codex/places` (`{ name, notes: text }`) or `/codex/rules`
  (`{ rule: name, description: text }`), then `markUsed` with
  `usedAs: { kind: 'codex-<type>', refId: <new id>, label: name }`.
- `useAsMapNote(api, workId, catchItem, { chapterId, chapterLabel, text })`: GETs
  `/map`, appends `text` to `chapters[chapterId].notes` (separated by a blank line
  when notes already exist), PUTs `/map/chapters/:chapterId { notes }`, then
  `markUsed` with `usedAs: { kind: 'map-note', refId: chapterId, label: chapterLabel }`.
- Both return `{ ok: true }`, `{ ok: false, stage: 'create', error }` (nothing
  changed) or `{ ok: false, stage: 'mark', error }` (the entry or note was added but
  the catch is still open).
- `defaultName(text)` → the first line, trimmed, cut to 60 characters.

### Caret memory and insert (`utils/editorBlocks.js`, `EditorContext`, `Editor.jsx`)

- `EditorContext` gets `caret` (`{ block, offset } | null`) and `SET_CARET`;
  `LOAD_CONTENT` resets it. `selection` is unchanged, so Polish behaves the same.
- `Editor.jsx`'s `selectionchange` handler records `caret` from the range's end
  whenever the range is inside the editor (collapsed or not).
- `editorBlocks.js` gains `blockOffsetToPoint(root, blocks, { block, offset })` →
  `{ node, offset } | null`, the inverse of `pointToBlockOffset`, and
  `insertParagraphAfter(root, caret, text)`:
  - Finds the caret's block; if `caret` is null or out of range, uses the last block
    (or the empty editor).
  - Focuses the editor, puts a collapsed selection at the end of that block, and runs
    `execCommand('insertParagraph')` then `execCommand('insertText', false, text)`,
    so the browser's undo (Ctrl+Z) removes it and `input` fires (autosave and word
    count update as for typing).
  - Returns `true` when it inserted.
- The Catch tab's **Insert** is shown only when a chapter is open. It inserts into
  the open chapter, then calls `markUsed` with
  `usedAs: { kind: 'insert', refId: chapterId, label: chapterLabel }`.

### Catch tab (`components/panel/CatchTab.jsx`, rewritten)

Top to bottom:

1. Search input ("Search catches").
2. Status filter: `Open` (default) · `Used` · `Discarded` · `All`.
3. Groups from `groupCatches`.
4. Empty states: no open catches → "No open catches. Press Ctrl+Shift+I to capture
   an idea."; a query with no results → "Nothing matches “x”."

Each row (`components/panel/CatchRow.jsx`, new):

- Text clamped to 3 lines; clicking expands it. Age from `timeAgo`. The chapter label
  is shown in groups other than `this`.
- Used catches show the `usedAs` line: "Inserted in Ch. 3 — The Well",
  "Codex character: Mara", "Map note: Ch. 3".
- Actions (visible on row hover/focus; always visible on touch-width screens):
  - open: **Insert**, **Use as…**, **Edit**, **Used**, **Discard**
  - used / discarded: **Reopen**
- **Edit** swaps in a textarea plus a chapter select (`No chapter` + each chapter's
  label). Enter (without Shift) saves, Escape cancels. Validation errors from the
  server show under the field.
- **Use as…** shows a target select (Codex character / Codex place / Codex rule /
  Map note) and then, for Codex, a name field (prefilled with `defaultName`); for Map
  note, a chapter select (defaulting to the tag, else the open chapter). Save runs
  the matching action. On `stage: 'create'`, the row shows the error and stays open;
  on `stage: 'mark'`, it shows "Added, but couldn't mark the catch used." After a
  Codex conversion, `refreshCodex` runs; after a Map note, `refreshMap`.
- Every action ends with `refreshCatches`.

### Badges

- `RightPanel.jsx`: the Catch tab label is `Catch · N` when N > 0 open catches are
  tagged to the open chapter.
- `MainRoom.jsx`: a chapter in the list with open tagged catches shows a small gold
  dot after its title, with the tooltip "N open catch(es)".
- `ActiveWorkContext.loadWork` also fetches catches, so badges show before the tab
  is opened. A failed fetch there does not fail `loadWork`.

### Capture overlay

Unchanged, except the chapter select uses `chapterLabel`.

## Error handling

- Server: bad fields → 400 `INVALID_FIELD` with the field name; unknown catch → 404
  (as today). A failed catches lookup inside `buildContext` is logged and the packet is
  built without it (AI calls never fail because of catches).
- Client: every action catches its error and shows it on the row; nothing throws to
  the page.

## Testing

- **Unit (server, `node --test`)**: `catchFields` (whitelist, trim and cap, status
  values, `usedAs` shape, reopen clears `usedAs`); `contextBlock` (catches section,
  10-item and 300-char limits, one-line collapse, no section when empty, manifest
  count via `buildContext` is covered by E2E).
- **Unit (client)**: `catchGroups` (grouping, book order, missing chapter → untagged,
  status filter, search on text and chapter title, `timeAgo`); `catchActions` with a
  fake `api` (call order, each failure stage, map-note append with empty and existing
  notes); `editorBlocks` with `linkedom` (`blockOffsetToPoint` round trip with
  `pointToBlockOffset`, out-of-range caret → last block).
- **API E2E** against a throwaway Mongo: the PUT whitelist (setting `workId`,
  `createdAt` has no effect), 400s, tagging a chapter of another work → 400, chapter
  delete untags its catches, the context manifest for hooks counts catches (fake
  provider).
- **Browser** (Playwright, fake provider): badge and dots; grouping and search; edit
  and retag; Insert then Ctrl+Z; Insert without a remembered cursor; each Use as…
  target showing up in the Codex / on the Map; Reopen; 390 px layout.

## Out of scope

- Catches anchored to positions in the text (waits for scenes or a TipTap move).
- An AI suggesting where a catch fits.
- Bulk actions; catches in export; catches on the Map or Codex pages (the Map can
  show them later with plot threads).
