# Shared Story Context for AI Calls — Design

Date: 2026-10-10

## Purpose

Every AI call today is stateless: it sees one excerpt of text (often capped
at 6,000 characters) and nothing about the story around it — no premise, POV,
tone, Codex, outline, or earlier chapters. The AI contradicts established
facts and gives feedback that ignores what has already happened.

This design grounds AI calls in the story, for two outcomes:

- **Consistency** — the AI respects names, facts, world rules, and voice.
- **Continuity** — the AI knows what happened in earlier chapters.

Unlocking new features (e.g. "I'm stuck / what next") is a later step that
will build on this; it is not part of this design.

## Decisions

| Question | Decision |
|---|---|
| When are chapter summaries made? | Lazily, when an AI call needs them. The writer can view and edit them; an edited summary is never overwritten automatically. |
| Which Codex entries go in? | Characters and places whose name or alias appears in the text being sent, plus all world rules. |
| How much continuity? | Summaries of every earlier chapter (all chapters for whole-work calls like pacing). |
| How much control? | Always on. Each AI result shows a "Context used" line that expands to details. |
| Architecture | A server-side context builder; each AI route declares which parts it needs. |

Background constraints: users bring their own API key (cost matters), both
Anthropic and OpenAI providers must work, and every call goes through
`complete()` in `server/src/services/llmService.js`.

## Chapter summaries

### Storage

`Chapter` (`server/src/models/Chapter.js`) gains:

```js
summary: {
  text: { type: String, default: '' },        // ~100–150 words, plain prose
  sourceHash: { type: String, default: '' },  // sha1 of chapter `content` it was made from
  generatedAt: { type: String, default: null },
  edited: { type: Boolean, default: false },  // true once the writer edits it
}
```

The summary lives on the chapter because it belongs to exactly one chapter
and is deleted with it.

### Status

A pure function `summaryStatus(chapter)` returns:

| Status | Condition |
|---|---|
| `none` | no summary text |
| `current` | not edited, `sourceHash` matches sha1 of `content` |
| `outdated` | not edited, hash differs |
| `edited` | edited, hash matches |
| `edited-outdated` | edited, hash differs (chapter changed since the edit) |

When the writer edits a summary, `sourceHash` is set to the chapter's current
hash, so `edited` vs `edited-outdated` reflects later chapter changes.

Chapters with empty `content` never get a summary and are skipped in context.

### Generation

`server/src/services/summaryService.js`:

- `ensureSummaries(work, chapters)` — for the given chapters, generates any
  whose status is `none` or `outdated` (never `edited*`), with at most 3
  generations running at once. Returns `{ summaries: Map<chapterId, text>,
  unavailable: number }`.
- `generateSummary(work, chapter)` — one LLM call via `complete()` with
  `maxTokensOverride: 300`. The prompt asks for 100–150 words covering what
  happens, who is involved, facts or reveals later chapters depend on, and
  how the chapter ends emotionally. Input is the chapter `content`; above
  ~24,000 characters it is truncated from the middle (keeping the opening and
  the ending) by a pure `truncateMiddle(text, maxChars)` helper.
- Saving uses a conditional update: the summary is written only if the
  chapter's content still hashes to the value used for generation **and**
  `summary.edited` is still false. Otherwise the result is discarded (but
  still used for the current request).
- In-flight generations are shared through an in-memory `Map` keyed by
  `chapterId:hash`, so two concurrent requests needing the same summary pay
  once. This assumes a single server process, which is how the app is
  deployed.

### Failure handling

- `NO_API_KEY` from any generation fails the whole request, as today.
- Any other generation failure (provider error, empty output) leaves that
  chapter out of the context and increments `unavailable`; the main call still
  runs.
- If the main call fails after summaries were generated, the summaries are
  already saved and not wasted.

## Context builder

`server/src/services/storyContextService.js`:

```js
const { text, manifest } = await buildContext({
  work,          // Work document (from loadWork / loadWorkFromBody)
  chapterId,     // optional: the chapter the call is about
  sourceText,    // optional: the text sent with the call, used for Codex matching
  needs: {
    story: true,             // title, genre, POV, tone, protagonist, premise
    codex: true,             // mentioned characters/places + all rules
    summaries: 'before',     // 'before' | 'all' | false
    mapBeat: true,           // act / beat / notes for chapterId
  },
});
```

`buildContext` loads what it needs (chapters, Codex, Map) for `work.id`,
calls `ensureSummaries` when `needs.summaries` is set, and returns:

- `text` — the context block, or `''` if nothing applies.
- `manifest` — what went in, e.g.
  `{ summaries: 7, unavailable: 1, codex: ['Mara', 'Vell Keep'], rules: 4, beat: 'Midpoint', act: 'Act II' }`.

### Block format

The block is placed at the top of the route's prompt:

```
<story_context>
Reference material about the writer's story. Use it to stay consistent with
established facts and events. Do not edit, summarise, or comment on it unless asked.

## Story
Title: …
Genre: … · POV: … · Tone: …
Protagonist: …
Premise: …

## Story so far
Ch. 1 — The Bell: <summary>
Ch. 2 — …: <summary>

## Codex
Characters:
- Mara (aka Lady Mara) — role: …; physical: …; notes: …
Places:
- Vell Keep — …
World rules:
- [magic] …

## This chapter on the Map
Act II · Beat: Midpoint · Notes: …
</story_context>
```

Rules:

- Empty fields and empty sections are omitted.
- **Story so far:** `before` = chapters with `order` less than the current
  chapter's, in order; `all` = every chapter. The current chapter's own text
  is never summarised into its own context. Chapters without a usable
  summary are listed by title only.
- **Codex matching:** a pure `findMentions(codex, text)` matches each
  character's and place's `name` and every alias as a whole word,
  case-insensitively (escaped regex, like `consistencyService.scan`). Entries
  are cut to their key fields — characters: name, aliases, role, physical,
  notes; places: name, description, notes; rules: category, rule,
  description — and each entry to ~400 characters.
- **Budget:** if the Codex section exceeds ~8,000 characters, character and
  place entries are dropped (fewest mentions first) until it fits; world
  rules are kept. Summaries are never trimmed.

### Per-route needs

| Route | story | codex | summaries | mapBeat |
|---|---|---|---|---|
| `polish-draft` | ✓ | ✓ | before | ✓ |
| `editor-review` (all modes) | ✓ | ✓ | before | ✓ |
| `hooks` (with `workId`) | ✓ | ✓ | before | ✓ |
| `rekindler` | ✓ | — | before | ✓ |
| `pacing` | ✓ | — | all | — |
| `beat-suggest` | ✓ | — | all | — |
| `codex-audit` | ✓ | — | — | — |
| `codex-suggest` | ✓ | — | — | — |
| `hooks` (wizard, no `workId`) | — | — | — | — |
| `tension-infer` | — | — | — | — |

Notes:

- `pacing` replaces its current titles-and-word-counts payload with
  per-chapter summaries alongside the existing tension and beat data.
- `rekindler` uses the chapter it already picks (most recently saved) as
  `chapterId`.
- `beat-suggest` and `tension-infer` have no client callers today; they are
  updated for consistency only.

### Ownership

Routes that gain context and don't already check ownership use
`loadWorkFromBody()`: `polish-draft`, `editor-review`, `codex-suggest`
(required `workId`) and `beat-suggest` (optional). A `chapterId` in the body
must belong to `req.work`, otherwise it is ignored.

## API changes

- AI responses gain a `context` field holding the manifest, e.g.
  `{ polished, context }`, `{ hooks, context }`, `{ mode, summary, flags, context }`.
  Existing fields are unchanged. Routes without context return no `context` field.
- `PUT /api/works/:workId/chapters/:chapterId/summary` — body `{ text }`.
  Sets `summary.text`, `edited: true`, `sourceHash` = current content hash,
  `generatedAt` unchanged. Returns the chapter's `summary` and
  `summaryStatus`.
- `POST /api/works/:workId/chapters/:chapterId/summary/regenerate` — clears
  `edited`, generates a fresh summary now, saves it, and returns
  `summary` + `summaryStatus`. Fails with `NO_API_KEY` or the provider error;
  an empty chapter returns 400 `EMPTY_CHAPTER`.
- `GET /api/works/:workId/chapters` includes `summary.text` and a computed
  `summaryStatus` per chapter (still no `content`).
- `PUT /api/works/:workId/chapters/:chapterId` ignores any `summary` field in
  the body; only the two endpoints above change it.

## Client changes

- **Requests:** Polish, Editor Review, and Codex suggestions start sending
  `workId` (and `chapterId` where there is one). The text sent stays the
  editor's live text, which may include unsaved edits.
- **`ContextUsed` component** (`client/src/components/panel/ContextUsed.jsx`):
  one muted line under an AI result, e.g.
  `Context: 7 chapter summaries · 3 Codex entries · 4 rules · Beat: Midpoint`.
  Clicking expands to the Codex names and act/beat; an `unavailable` count
  shows as a warning ("1 summary couldn't be made"). Rendered on Quill
  results (hooks, pacing), the Polish modal, the Editor Review modal, Map
  pacing, the Codex Audit modal, Codex suggestions, and the Rekindler card.
- **Loading text:** where the client can see that earlier chapters'
  `summaryStatus` is `none` or `outdated`, the loading text reads
  "Thinking… (updating chapter summaries)" instead of "Thinking…".
- **Summary modal** (`client/src/components/overlays/ChapterSummaryModal.jsx`),
  opened from a **Summary** button in the Main Room toolbar next to History:
  shows the summary and a status label —
  `current` "Up to date", `outdated` "Outdated — refreshes on next AI use",
  `edited` "Edited by you", `edited-outdated` "Edited by you; chapter changed since",
  `none` "No summary yet" — with Edit/Save and Regenerate (Generate when
  `none`). Saving or regenerating refreshes the chapter list.
- **Map chapter detail** shows the summary read-only above Notes, with the
  same status label.

## Error handling summary

| Situation | Behaviour |
|---|---|
| No API key | Request fails with `NO_API_KEY` (unchanged UI message) |
| One summary generation fails | Chapter listed by title only; `manifest.unavailable` incremented; main call proceeds |
| Writer edits summary during generation | Generated text not saved (conditional update); writer's edit wins |
| Chapter content changes during generation | Generated text not saved; next call regenerates |
| Same summary needed by concurrent calls | Generated once (in-flight map) |
| `chapterId` not in the work | Ignored; context built without chapter-specific parts |

## Cost and performance

- A 40-chapter novel's summaries are ~6k words; with Codex and story fields a
  grounded call adds roughly 10k input tokens.
- The first call after a lot of writing generates several summaries before the
  main call (3 at a time): roughly 15–30 s once for a 30-chapter backlog,
  then only changed chapters regenerate.

## Testing

No test runner exists today. Add Node's built-in runner (`node --test`,
no dependency) with `npm test` in `server/package.json`, covering the pure
functions:

- `findMentions` — names and aliases, whole-word and case-insensitive,
  regex-special characters in names.
- `summaryStatus` — all five states.
- `truncateMiddle` — short text untouched, long text keeps head and tail.
- Block assembly and budget trimming — section omission, ordering, Codex
  trimmed fewest-mentions-first, rules kept, summaries untouched.

End-to-end verification, as in the feature-gap fixes: API checks against a
throwaway Mongo with a stub provider, plus a browser pass over the Summary
modal and the "Context used" line. The stub is a `fake` adapter registered in
`llmService` only when `NODE_ENV === 'test'`; it returns deterministic text
(and valid JSON for routes that expect it) so routes run without a real key.

## Out of scope

- Prompt caching of the context block.
- Streaming responses or progress events.
- "I'm stuck / what next" and other new AI features.
- Lifting the 6,000-character cap on editor review.
- A rolling "story so far" digest for very long books.
- Background or on-save summary generation.
