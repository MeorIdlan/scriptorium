# Polish Review (accept/reject changes) — Design

Date: 2026-10-11

## Purpose

Today "Polish this draft" rewrites the whole chapter and, on accept, replaces
the editor content with plain text: the writer can't see what changed, can't
keep some edits and drop others, loses all formatting (bold, italic, fonts,
alignment), and long chapters risk being cut off by the output token cap.

This design makes Polish reviewable: the AI's edits are shown as
sentence-level changes the writer accepts or rejects one by one, it can
polish just a selection, and applying keeps the formatting of everything the
writer didn't change.

Version history (diff view, named snapshots) is step 3's other half and gets
its own spec later.

## Decisions

| Question | Decision |
|---|---|
| Which half of step 3 first? | Polish with accept/reject; version history later, separate spec. |
| Change granularity | Sentence: one change per changed sentence (or run of adjacent sentences when merged/split), with word-level marks inside. |
| Where review happens | A larger review modal (not inline tracked changes in the editor). |
| Architecture | AI returns plain-text rewrites of numbered targets; the client diffs and applies. |
| Selection | Only the selection (expanded to whole sentences) is edited, but the AI always gets the whole chapter plus story context. |
| Whole chapter | Polished in parts of ~1,500 words, one request per part, each with the whole chapter as context. |

## Writer flow

1. **Start.** If the writer has a non-empty selection inside the editor, the
   Quill button reads **✦ Polish selection**; otherwise **✦ Polish chapter**.
   It is disabled when there's nothing to polish (empty chapter or a
   selection containing no text).
2. **Progress.** The review modal opens immediately and shows
   "Polishing part 2 of 4…" while parts run sequentially.
3. **Review.** The polished scope is shown paragraph by paragraph. Unchanged
   sentences render as plain text. Each change renders inline: removed words
   struck through, added words highlighted, with **✓ Accept** / **✕ Reject**
   controls. A header shows `12 changes · 5 accepted · 2 rejected` and
   **Accept all** / **Reject all**. Changes start as pending (neither). The
   "Context used" line (from story context) stays at the bottom.
4. **Apply.** **Apply accepted changes** writes accepted changes into the
   editor and closes the modal; pending and rejected changes are left as the
   original text. Autosave saves as usual; the existing History snapshots
   cover undo. **Discard** closes without changing anything. Apply is
   disabled while parts are still running or when nothing is accepted.
5. **Safety.** If a paragraph's text changed between polishing and applying,
   its changes are skipped and the modal reports
   "2 changes skipped because the text changed".

## Server

### `POST /api/ai/polish-draft` (replaces the current route)

Keeps `loadWorkFromBody()` (requires `workId`, ownership-checked).

Request:

```js
{
  workId,
  chapterId,     // optional; scopes story context as today
  chapterText,   // full plain text of the chapter (read-only context)
  targets: [{ id: 't1', text: '…' }, …],
}
```

Response:

```js
{ rewrites: [{ id: 't1', text: '…' }, …], missing: ['t2'], context }
```

Validation:

- `targets` must be a non-empty array of `{ id: string, text: non-blank string }`
  with unique ids; otherwise `400 MISSING_FIELD`.
- Total target words over **2,000** → `400 TOO_LONG`.
- `chapterText` is optional; above **60,000** characters it is truncated from
  the middle (`truncateMiddle` from `summaryText.js`).

Prompt (story context prepended as for other routes, with
`{ story: true, codex: true, summaries: 'before', mapBeat: true }` and
`sourceText` = the targets' text joined):

```
You are polishing passages of a writer's chapter. Improve grammar, fix clumsy
sentence structure, and make the prose more expressive and vivid — while keeping
the story direction, plot beats, characters, dialogue meaning, and tone exactly
as the writer intended.

Rules:
- Rewrite ONLY the passages marked [[id]] … [[/id]] below. The full chapter is
  given for context; do not rewrite anything else.
- Return every marked passage, each wrapped in the same markers, and nothing else.
- If a passage is already good, return it unchanged.
- Do NOT add new plot events, characters, or scenes. Do NOT change what happens.
- Keep paragraph breaks inside a passage as they are.

<chapter>
…chapterText…
</chapter>

Passages to polish:
[[t1]]…[[/t1]]
[[t2]]…[[/t2]]
```

Output cap: `maxTokensOverride = min(8000, ceil(targetWords × 2.2) + 200)`
(≈1.5× words in tokens plus headroom), so a 2,000-word request fits.

### Parsing (`server/src/services/polishService.js`, pure)

- `parseRewrites(raw, ids)` extracts `[[id]] … [[/id]]` blocks (non-greedy,
  multiline). Text is trimmed of the leading/trailing newline the markers
  introduce, but inner whitespace is kept. Returns
  `{ rewrites: [{ id, text }], missing: [ids] }`.
- A target is **missing** when its block is absent, empty/whitespace, or its
  id appears more than once (ambiguous). Unknown ids and text outside markers
  are ignored.
- `buildPolishPrompt({ chapterText, targets })` returns the prompt above
  (without story context; the route prepends it).
- `countWords` from `wordCountService.js` measures target length.

### Fake provider

`providers/fake.js` recognises the polish prompt (`Passages to polish:`) and
returns every `[[id]]…[[/id]]` block with a predictable edit: replace the
first occurrence of `very ` with `deeply `, and of `walked` with `strode`; if
neither occurs, return the passage unchanged.

## Client

### Selection memory

The side-panel button can take focus from the editor. `Editor.jsx` listens
to `selectionchange` and stores, in `EditorContext`, the last selection whose
range is inside the editor and not collapsed (`{ blockStart, offsetStart,
blockEnd, offsetEnd }` in block/text-offset terms, see below). A collapsed
selection inside the editor clears it. Loading a different chapter clears it.

### Blocks and targets (`client/src/utils/editorBlocks.js`)

- `getBlocks(editorEl)` returns the editor's top-level blocks in order: each
  top-level element child (`div`, `p`, `h1`–`h3`, `blockquote`) is a block;
  consecutive top-level inline nodes (text, `b`, `i`, `u`, `span`, `font`,
  `br`) before/between block elements form one block. Each block:
  `{ index, node(s), text }`, where `text` is the concatenation of its text
  nodes with each `<br>` counted as `\n`.
- `blockTextOffset` ⇄ DOM position helpers map between `(blockIndex,
  textOffset)` and `(textNode, nodeOffset)` using the same walk.
- `chapterTargets(blocks)` → one target per block with non-blank text,
  `{ id, blockIndex, start: 0, end: text.length, text }`.
- `selectionTargets(blocks, sel)` → for each block the selection touches, the
  range expanded outward to sentence boundaries (`splitSentences`) within
  that block; blank results are dropped.
- `batchTargets(targets, maxWords = 1500)` → arrays of targets, in order,
  each ≤ maxWords. A single target over **1,500** words is split at sentence
  boundaries into several targets (adjacent ranges in the same block) before
  batching.

Target ids are `t<n>` in document order and are unique within one Polish
session.

### Diff engine (`client/src/utils/polishDiff.js`, pure)

- `splitSentences(text)` splits after `.`, `!`, `?`, `…` plus any closing
  quotes/brackets (`"'”’)]`), followed by whitespace; each piece keeps its
  trailing whitespace so `pieces.join('') === text`. Text with no terminator
  is one sentence.
- `diffSentences(original, rewrite)` → LCS over the two sentence lists
  (compared with trailing whitespace normalised) → segments:
  `{ type: 'equal', text, start, end }` or
  `{ type: 'change', fromText, toText, start, end }` where `start`/`end` are
  offsets in `original`. Adjacent unmatched sentences on either side merge
  into one change. A pure insertion (no original sentences) is anchored at
  the sentence boundary (`start === end`); a pure deletion has
  `toText === ''`. Sentences carry their trailing whitespace on both sides,
  so replacing `[start, end)` with `toText` always joins cleanly with the
  following text.
- `diffWords(fromText, toText)` → tokens (words, whitespace, punctuation as
  separate tokens) with LCS → `[{ type: 'same'|'del'|'add', text }]`, for
  display only.
- `buildChanges(targets, rewrites)` → for each target with a rewrite whose
  text differs, the `change` segments mapped to block offsets
  (`target.start + segment.start`), each
  `{ id, targetId, blockIndex, start, end, fromText, toText, status: 'pending' }`.

### Apply (`client/src/utils/applyPolish.js`)

`applyPolish(editorEl, changes, originalBlockTexts)`:

1. Re-read blocks. For each block with accepted changes, if its current text
   ≠ the text captured when the session started, skip all its changes
   (count them as skipped).
2. Within a block, apply accepted changes in descending `start` order.
3. For each change: map `(blockIndex, start)` and `(blockIndex, end)` to DOM
   positions, `range.deleteContents()`, insert a text node with `toText` at
   the start position. Line breaks in `toText` become `<br>`.
4. Return `{ applied, skipped }`. The caller then dispatches the editor's
   normal update (`setContent(innerText, innerHTML)`), so autosave, word
   count and History behave as for typing.

Formatting outside each changed range is untouched; inserted text inherits
the inline formatting at the insertion point.

### UI

- **QuillTab:** the Polish button label/disabled state described above.
  Clicking opens the review modal with the captured targets (chapter or
  selection), `chapterText` (`editorState.content`) and the block texts at
  capture time.
- **`PolishReviewModal.jsx`** (replaces `DraftPolishModal.jsx`): runs the
  batches sequentially via `api.post('/ai/polish-draft', …)`, tracking
  per-part status (`pending | running | done | failed`). Renders each target's
  segments: equal text plain; changes with Accept/Reject buttons. A pending
  change shows the `diffWords` marks (removed words struck through, added
  words highlighted); an accepted change shows the rewrite only, highlighted;
  a rejected change shows the original only, dimmed. Clicking the opposite
  button switches its state. Header counts, Accept all / Reject all, Apply,
  Discard, `ContextUsed` (from the first successful part's `context`).
- Reports: missing targets ("2 passages came back unchanged"), failed parts
  with **Retry part**, skipped changes after Apply (shown as a toast-like
  line in the panel, since the modal closes).

## Errors

| Situation | Behaviour |
|---|---|
| A part fails (provider error/timeout) | Finished parts stay reviewable; "Part 3 of 4 failed" with **Retry part** |
| `NO_API_KEY` / auth error | Show the error; stop remaining parts |
| Targets missing from the reply | Treated as unchanged; "N passages came back unchanged" |
| Nothing to polish | Button disabled |
| Modal closed mid-run | Nothing applied; late responses ignored |
| Paragraph changed before Apply | Its changes skipped and counted |
| Request over 2,000 target words | `400 TOO_LONG` (client batching prevents this) |

## Testing

- **Server (`node --test`):** `parseRewrites` (normal, missing, empty,
  duplicate id, stray text, multiline passages), `buildPolishPrompt`
  (markers, chapter wrapper), target validation and the word cap.
- **Client (`node --test`, new `npm test` script in `client/package.json`):**
  `splitSentences` (round-trip, quotes, ellipsis, no terminator),
  `diffSentences` (equal, single change, merge/split, insertion, deletion),
  `diffWords`, `buildChanges` offset mapping, `batchTargets`,
  `getBlocks`/offset helpers and `applyPolish` using **linkedom** (new
  dev-only dependency) — formatting before/after a change survives, reverse
  order lands correctly, ranges crossing `<b>` boundaries, `<br>` handling,
  skip on changed block text.
- **End-to-end:** fake provider + throwaway Mongo; browser pass: polish one
  selected sentence, polish a long chapter in parts, accept some/reject some,
  confirm formatting survives and autosave stores the result, and the
  skipped-block path.

## Out of scope

- Version history / diff view of snapshots (separate spec).
- Inline tracked changes inside the editor (comes with a TipTap migration).
- A per-change explanation from the AI.
- Streaming responses.
- Undo beyond the existing History snapshots.
