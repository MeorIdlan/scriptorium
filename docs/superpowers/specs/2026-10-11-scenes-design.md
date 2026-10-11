# Scenes — design

Step 4 of the roadmap ("Scenes, plot threads, and catches shown in context") is
split into three features. Catches in context is done. This spec covers the
second: **scenes**. Plot threads get their own spec later.

## Problem

A chapter is one block of HTML with no structure below it:

- The writer can't split a chapter into scenes, or record a scene's POV, location,
  status or summary.
- Nothing shows how a chapter is built, so restructuring means scrolling and
  cutting and pasting.
- "Hooks for this scene" sends the whole chapter.
- Export has no scene breaks. It also splits paragraphs on blank lines, so a chapter
  written in the editor (Chrome writes one `\n` between `<div>` paragraphs) exports
  as a single paragraph.

## Goals

1. The writer can add scene breaks in the editor and give each scene a card
   (title, POV, location, status, summary).
2. The open chapter's scenes are listed beside the editor; clicking one jumps to it.
3. Scenes can be reordered within a chapter and moved to another chapter.
4. The Map shows each chapter's scenes and can filter the book by POV.
5. The AI sees the current scene's card and the chapter's scene list; export prints
   scene breaks and real paragraphs.

## Decisions (made with the dev)

| Question | Decision |
|---|---|
| What a scene is | A break in the chapter text plus an optional card (title, POV, location, status, summary). The chapter stays one document. |
| Scope this round | All four: scene outline in the editor, scenes on the Map, reordering and moving, scene-aware AI and export |
| Where breaks and cards live | Approach 1: the card's fields are attributes on the break marker in the chapter HTML. Undo, history, milestones and moves keep text and card together. The server reads markers on save. |
| Break symbol in export | `* * *`, centred |

## Data

### The marker

A scene starts with a top-level marker in `contentHtml`:

```html
<hr data-scene="scn_1791700000000_a1b2c3" data-title="The well" data-pov="Mara"
    data-location="Old town" data-status="draft" data-summary="Mara finds the letter.">
```

| Attribute | Rule |
|---|---|
| `data-scene` | Id `scn_<Date.now()>_<6 hex>`. Unique within its chapter. |
| `data-title` | ≤ 120 characters |
| `data-pov` | ≤ 60 characters |
| `data-location` | ≤ 80 characters |
| `data-status` | `todo` \| `draft` \| `revise` \| `done`; default `draft` |
| `data-summary` | ≤ 600 characters |

Empty attributes may be omitted. Values are plain text (attribute-escaped).

### Scenes in a chapter

- A chapter with no markers is **one implicit scene with no card**. Every existing
  chapter is in this state, so there is no migration.
- Text before the first marker is the **opening scene**, which has no card (id
  `null`; the move endpoint calls it `"opening"`). It gets a card when the writer
  edits its card, which inserts a marker at the start of the chapter.
- Adding a break inserts one marker, so the first break in a chapter creates two
  scenes: the opening scene (no card) and the new one.

### `Chapter.scenes` (new, derived)

On every save that changes `contentHtml`, the server stores
`scenes: [{ id, title, pov, location, status, summary, wordCount }]`, one entry per
scene **including** the opening scene (`id: null`, empty fields) when it has text. A chapter with no markers stores `[]`. `contentHtml` is the
source of truth; `scenes` is always rebuilt from it and never accepted from a client.

## Server

### `services/sceneMarkers.js` (new, pure)

Uses `htmlparser2` (added as a direct dependency, pinned to `12.0.0`, the version
`sanitize-html` already installs).

- `SCENE_STATUSES = ['todo', 'draft', 'revise', 'done']`, `SCENE_LIMITS = { title:
  120, pov: 60, location: 80, summary: 600 }`, `newSceneId()`.
- `parseScenes(html)` → `[{ id, title, pov, location, status, summary, html,
  paragraphs, text, wordCount }]`:
  - Splits at top-level `<hr data-scene>` elements (an `<hr>` nested inside a block
    is not a break).
  - `paragraphs`: one string per block, in the same model as the client's
    `getBlocks` — each top-level `p`/`div`/`h1`–`h3`/`blockquote` is a block, a run
    of top-level inline nodes is a block, `<br>` is a line break inside a block, and
    a nested block starts a new line. Blank paragraphs are dropped.
  - `text` = `paragraphs.join('\n')`; `wordCount` uses `countWords`.
  - A chapter with no markers returns one scene with `id: null`.
  - The opening scene is returned only when it has text or there are no markers.
- `sceneSummaries(html)` → the `Chapter.scenes` array (no `html`/`paragraphs`/`text`),
  or `[]` when there are no markers.
- `chapterText(html)` → plain text for `Chapter.content` when the server rebuilds a
  chapter (moves): scenes' `text` joined with `\n\n`.
- `moveScene({ srcHtml, dstHtml, sceneId, toIndex, sameChapter })` →
  `{ srcHtml, dstHtml }` or `{ error: 'NOT_FOUND' | 'INVALID_INDEX' | 'NO_CHANGE' }`:
  - `sceneId` is a marker id or `'opening'`.
  - `toIndex` counts scenes in the destination as it is **before** the move
    (0 … n), after removing the moved scene when `sameChapter`.
  - No scene ever merges into another because of a move: a card-less segment that
    ends up anywhere but first gets an empty marker with a new id (this covers a
    moved opening scene and a destination opening scene that something is moved in
    front of).
  - Moving a scene to where it already is returns `NO_CHANGE`.

### Sanitizer (`services/htmlService.js`)

- `hr` is allowed with only `data-scene`, `data-title`, `data-pov`, `data-location`,
  `data-status`, `data-summary`. Every other attribute (including `contenteditable`
  and `style`) is dropped.
- Each value is trimmed and cut to its limit; a status outside `SCENE_STATUSES`
  becomes `draft`.
- A `data-scene` already used earlier in the same chapter gets a new id.
- An `hr` with no `data-scene`, or an invalid one (pasted from elsewhere), becomes a
  scene marker with a new id.

### `routes/chapters.js`

- `PUT /:chapterId` stores `scenes: sceneSummaries(newHtml)` whenever it stores
  `contentHtml`. `scenes` in the request body is ignored.
- `GET /` already returns every field except `contentHtml` and `content`, so
  `scenes` reaches the client with the chapter list.
- **New** `POST /:chapterId/scenes/move` with `{ sceneId, toChapterId, toIndex }`:
  1. `sceneId` must be a non-empty string; `toChapterId` a chapter of this work;
     `toIndex` an integer ≥ 0. Otherwise 400 `INVALID_FIELD` with the field name.
     Unknown source chapter → 404.
  2. `moveScene(...)`: `NOT_FOUND` → 404 `SCENE_NOT_FOUND`; `INVALID_INDEX` → 400
     `INVALID_FIELD` (`toIndex`); `NO_CHANGE` → 200 with the chapters unchanged.
  3. Takes an automatic snapshot of each changed chapter with note
     `Before moving a scene` (`takeAutoSnapshot(chapter, now, { note })`; noted
     snapshots are never thinned). A snapshot failure aborts the move with 500.
  4. For each changed chapter: sanitizes the new HTML, sets `contentHtml`,
     `content = chapterText(html)`, `wordCount`, `scenes`, `updatedAt`, and moves
     `status` from `outline` to `draft` when it now has words.
  5. Writes the destination first, then the source. If the source write fails the
     response is 500 with `The scene was copied to "<dst title>" but not removed
     from "<src title>".`
  6. Runs the consistency scan for each changed chapter and `recalculate(workId)`;
     failures there are logged, not returned.
  7. Responds `{ chapters: [<changed chapters, as in GET>] }`.

### Story context

- `buildContext` accepts `needs.scene` (with `sceneId` passed alongside
  `chapterId`) and `needs.sceneList`. Both read the current chapter's stored
  `scenes`; no HTML is parsed.
- `formatContextBlock` gains `scene` and `sceneList` inputs, rendered after the
  Map section and before the catches:

  ```
  ## This scene
  Title: The well
  POV: Mara
  Location: Old town
  Status: draft
  Summary: Mara finds the letter.

  ## Scenes in this chapter
  - The well (Mara): Mara finds the letter.
  - Scene 2
  ```

  - "This scene" omits blank fields and is omitted when every field is blank.
  - The scene list is omitted when the chapter has no markers. Each line is
    `<title or "Scene N">` + ` (<POV>)` when set + `: <summary>` when set,
    whitespace-collapsed and cut to 200 characters; at most 30 lines.
- Manifest: `scene: true|false`, `sceneList: <lines sent>`. `ContextUsed` shows
  "this scene's card" and "N scene card(s)".
- Routes:
  - **hooks** takes an optional `sceneId` and passes `scene: true`.
  - **editor-review** and **rekindler** pass `sceneList: true`.
  - **polish-draft** and **beat-suggest** pass neither.
- A failure reading scenes inside `buildContext` is logged and the packet is built
  without them.

### Export (`services/exportService.js`)

- For a chapter with `contentHtml`, paragraphs come from `parseScenes(contentHtml)`
  (one per block), and a centred `* * *` paragraph is printed between scenes in
  PDF, DOCX and EPUB. Scene cards are not exported.
- A chapter with only plain `content` (older chapters) exports as it does today.

## Client

### Editor block model (`utils/editorBlocks.js`)

- A top-level `<hr>` is its own block in `getBlocks`, with empty text. Polish
  therefore never targets it, and applying Polish changes leaves markers in place.
- `blockPieces` treats `<hr>` like a closed block (content after it starts a new
  line).

### `utils/scenes.js` (new)

- `SCENE_STATUSES`, `SCENE_LIMITS`, `STATUS_LABELS` (`To do`, `Draft`, `Revise`,
  `Done`), `newSceneId()`, `sceneFieldError(field, value)` (live count message like
  catches: `"130 / 120 characters. Shorten it to save."`).
- `sceneList(root)` → `[{ id, marker, title, pov, location, status, summary,
  wordCount, index }]` from the editor DOM, same splitting rules as `parseScenes`
  (the opening scene included when it has text or there are no markers).
- `sceneAtNode(root, node)` → the index of the scene containing a top-level node
  (used with the remembered caret).
- `markerHtml(fields)` → the `<hr>` string with escaped attributes.
- `insertSceneBreak(root, caretNode)`: puts the caret at the end of the caret's
  block (reusing `blockEndPoint`), or at the end of the chapter with no caret, and
  runs `execCommand('insertHTML', false, markerHtml({ id: newSceneId() }) + '<div><br></div>')`
  so Ctrl+Z removes it and `input` fires. Then puts the caret in the new empty
  line. Returns `true` when it inserted.
- `writeSceneCard(root, sceneIndex, fields)`: sets the attributes on that scene's
  marker; for the opening scene, inserts a new marker at the start of the editor
  first. Dispatches an `input` event so autosave runs. (Not undoable with Ctrl+Z.)
- `removeSceneBreak(root, sceneId)`: removes the marker with `execCommand` on a
  selection around it, so Ctrl+Z restores it.
- `scrollToScene(root, sceneIndex)`: scrolls the marker (or the editor top for the
  opening scene) into view and puts the caret at the scene's first text.
- `lockMarkers(root)`: sets `contenteditable="false"` on every top-level marker;
  `Editor.jsx` calls it after loading a chapter, after a replacement (Polish,
  restore), and on `input` when a marker was pasted.

### Editor (`Editor.jsx`, `Toolbar.jsx`)

- A toolbar button **Scene break** (title "Add a scene break (Ctrl+Shift+Enter)")
  and the shortcut Ctrl+Shift+Enter (Cmd on Mac) while the editor has focus.
- Markers are styled as a centred `⁂` line with the scene title and status in small
  muted text (`hr[data-scene]` CSS, using `attr()` in `::after`).

### Scenes tab (`components/panel/ScenesTab.jsx`, `SceneRow.jsx`, new)

New right-panel tab **Scenes** between Quill and Codex. Top to bottom:

1. With no markers: one "Whole chapter" row (word count) and the hint "Add a scene
   break (Ctrl+Shift+Enter) to split this chapter into scenes."
2. Otherwise one row per scene from `sceneList`, refreshed on editor `input`
   (debounced ~300 ms) and on load. The scene containing the remembered caret is
   highlighted.

Each row:

- Title (or "Scene N"), `POV · location` when set, status chip, word count, first
  line of the summary.
- Click → `scrollToScene`.
- **Edit card** → inline fields: title, POV (a `datalist` of Codex character names),
  location (`datalist` of Codex place names), status select, summary textarea. Each
  shows `sceneFieldError` live and Save is disabled while any field is over its
  limit. Save → `writeSceneCard`. Escape cancels.
- **Remove break** (not on the opening scene) → confirm "Remove this scene break?
  The text joins the scene before it and this card is deleted." →
  `removeSceneBreak`.
- **Reorder**: a drag handle (HTML5 drag and drop within the list) and ↑/↓ buttons.
- **Move to…** → a chapter select (every chapter, `chapterLabel`) and a position
  select ("At the start", "After: <scene>" for each scene of that chapter, "At the
  end"); positions for other chapters come from the chapter list's `scenes`.
- A move runs `flushOpenChapter`, POSTs the move, reloads the open chapter's HTML
  into the editor (remount), refreshes the chapter list, and shows "Moved. History
  has the version from before the move." On error the row shows the message and
  nothing reloads.

### Map (`pages/MapView.jsx`, `components/map/*`)

- **Chapter detail:** a "Scenes" list after the existing fields: title, POV ·
  location, status chip, word count, summary (2-line clamp), and **Open in editor**,
  which navigates to the Main Room with that chapter open and scrolls to the scene
  (a `pendingScene` value in `UIContext`, consumed once by the Main Room after the
  editor mounts). With no markers: "No scene breaks in this chapter."
- **Chapter blocks:** small tick marks along the bottom edge, one per scene.
- **POV filter:** a select above the blocks — "All POVs" plus every distinct POV on
  cards across the book (compared trimmed and case-insensitive, shown with the first
  spelling seen). Choosing one dims chapters with no matching scene, shows the
  matching count on the others, and narrows the chapter detail's list.
- Pure helpers in `utils/sceneMap.js`: `povOptions(chapters)`,
  `scenesForPov(chapter, pov)`.

### AI (`QuillTab.jsx`)

"Suggest 3 hooks for this scene" sends the text of the scene at the remembered caret
and its `sceneId` (`null` for the opening scene or a chapter without markers, which
sends the whole chapter as today).

## Error handling

- Card fields over their limit can't be saved from the tab; the server trims and
  caps anything that arrives anyway.
- Malformed markers are repaired by the sanitizer on the next save; until then the
  parsers still treat any top-level `hr[data-scene]` as a break.
- The move endpoint never moves without a snapshot of each changed chapter, and
  writes the destination before the source, so a failure can duplicate a scene but
  never lose one.
- Scene parts of the AI context never fail an AI call.
- Every Scenes tab and Map action catches its error and shows it on the row.

## Testing

- **Unit (server, `node --test`):** `sceneMarkers` (splitting; the opening scene;
  paragraphs for `<div>`, `<p>`, `<br>`, bare inline runs and nested blocks; word
  counts; no markers; a nested `hr` not splitting; malformed markers);
  `moveScene` (within a chapter both directions, to another chapter, to index 0 in
  front of a card-less opening scene, moving the opening scene, `NO_CHANGE`,
  `NOT_FOUND`, `INVALID_INDEX`); the sanitizer (allowed attributes, limits, status
  reset, duplicate ids, bare `hr`); `contextBlock` scene sections and limits; export
  paragraph and break building.
- **Unit (client, `linkedom`):** `sceneList` and `sceneAtNode`; `<hr>` as its own
  block in `getBlocks` and a Polish apply keeping markers; `markerHtml` escaping;
  `writeSceneCard` (including the opening scene); `sceneMap` helpers.
  (`execCommand` paths are covered in the browser.)
- **API E2E** against a throwaway Mongo: save stores `scenes`; `scenes` in the
  chapter list; the move endpoint (within and across chapters, the two snapshots,
  every status code, word counts after); the context manifest for hooks and editor
  review (fake provider); an exported DOCX and EPUB containing `* * *` and separate
  paragraphs.
- **Browser** (Playwright, fake provider): add a break and Ctrl+Z; edit a card
  (including the opening scene); click a row to jump; remove a break and Ctrl+Z;
  drag, ↑/↓ and Move to… another chapter; Polish on a chapter with markers; the
  Map's scene list, ticks, POV filter and Open in editor; hooks for the current
  scene; the Scenes tab at 390 px.

## Out of scope

- Linking POV and location to Codex entries (they are plain text with suggestions).
- Moving scenes from the Map.
- AI-suggested scene breaks or summaries.
- Scene-level goals.
- Manuscript format (step 5).
