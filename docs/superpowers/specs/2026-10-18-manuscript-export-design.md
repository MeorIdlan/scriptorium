# Manuscript-format export (DOCX and PDF)

Card: https://trello.com/c/IgGF9LxQ · PRD: FR-19 · Epic: Export and backup (MVP 1)

## Intent

Agents and publishers expect submissions in standard manuscript format. Today
Scriptorium exports only a "reading" layout (Helvetica PDF, default-styled
DOCX, `* * *` scene breaks), so a novelist has to reformat the file by hand
before sending it out. This adds a **Manuscript** layout to DOCX and PDF
export, next to the existing **Reading** layout, so the file that comes out of
Scriptorium is ready to submit.

## Goals

- Export offers **Reading** or **Manuscript** layout for DOCX and PDF (A1).
- Manuscript output follows the standard format checklist (A2–A4, below).
- The writer sets the name, header surname and contact block used, as free
  text, and can use a different set for one work, e.g. a pen name (A5).
- Tests check the generated document structure for each rule (A6).

## Non-goals

- No manuscript layout for EPUB. EPUB keeps exporting the reading layout only.
- No per-publisher variants (A4 vs. Letter toggles, line counts, synopsis
  pages, query letters).
- No change to what text is exported: chapters, scenes and paragraphs come
  from `exportScenes()` exactly as today.

## Anti-goals

- **The reading layout must not change.** Any export without
  `layout: 'manuscript'` has to produce the same document it does today. The
  existing `buildPDF`, `buildDOCX` and `buildEPUB` are left as they are.
- Working notes must not leak into a submission: chapter notes are never
  printed in the manuscript layout.

## Decisions (made by the dev)

1. **Names are free text.** Author name, header surname and contact block are
   whatever the writer types, not derived from their account (except as the
   first-time default, see Data).
2. **Per writer, with a per-work override.** The writer's details are saved
   once and used for every work. A work can override them, e.g. a pen name for
   one series.
3. **Edited in the Export modal.** When Manuscript is picked, the modal shows
   the fields prefilled with what applies to this work. They're saved when the
   writer exports. There is no Settings-page section.
4. **"Only for this work" checkbox.** Unticked: the edits update the writer's
   defaults (and any override on this work is cleared). Ticked: the edits are
   saved as this work's override. The checkbox opens ticked when the work
   already has an override.
5. **Typeface choice:** the writer picks serif (Times New Roman, the default)
   or monospace (Courier New), 12 pt.
6. **Word count rounding is scaled:** under 10,000 words round to the nearest
   100; 10,000 and over round to the nearest 1,000. Shown as
   `about 87,000 words`.
7. **Optional header title:** a free-text "Header title" field per work,
   defaulting to the work title, always printed in capitals in the running
   header. Useful for long titles.
8. **Chapter notes are hidden** for the manuscript layout: the "Include
   chapter notes" checkbox isn't shown and notes are never printed. "Include
   outline chapters" stays.
9. **Title page: standard (Shunn) layout.** Contact block top-left, word count
   top-right, title and byline centred about halfway down.
10. **Chapters open a third of the way down** a new page, title centred, and
    the first paragraph isn't indented.
11. **A centred `END`** line closes the manuscript.
12. **A work override is a full set: blank means blank.** A field left blank
    in a work's override does not fall back to the writer's defaults, so a
    pen-name work never prints the writer's real contact details unless they
    were typed into the override.

## The format

All manuscript output, both formats:

| Rule | Value |
|---|---|
| Page | US Letter, 8.5 × 11 in *(my call, see below)* |
| Margins | 1 in on all sides |
| Font | 12 pt Times New Roman (serif, default) or Courier New (mono) |
| Line spacing | double, body text and title-page title block alike; the contact block and word count are single-spaced |
| Paragraphs | left-aligned (ragged right), first-line indent 0.5 in, no extra space between paragraphs |
| No indent | first paragraph of each chapter and first paragraph after a scene break |
| Scene break | a line holding only `#`, centred, between scenes (replaces `* * *`) |
| Chapters | each starts on a new page; title centred about 1/3 down the page (top of the text area + ~2.67 in, i.e. roughly 3.67 in from the top edge); text follows after one blank double-spaced line |
| Line breaks inside a paragraph | kept (`\n` → line break), as in the reading layout |
| End | after the last chapter, one blank line then `END` centred |
| Running header | `Surname / HEADER TITLE / n` right-aligned in the top margin (0.5 in from the top edge), same font, on every page **except** the title page |
| Page numbers | the title page is page 1 (unnumbered); the first header shows `2` |

**Title page** (page 1, no header):

```
Jane Q. Writer                         about 87,000 words
12 Some Street
City, ST 00000
jane@example.com



                  THE GLASS ORCHARD          ← about halfway down, centred

                    by J. Q. Ward
```

- Top-left: the contact block, as typed, one line per line, single-spaced.
  The contact block is expected to start with the writer's legal name; we
  don't add it.
- Top-right on the first line: the rounded word count.
- Centred about halfway down: the title in capitals (the work title, not the
  header title), then a blank line, then `by <author name>`.
- With no contact block, the top-left is empty; the word count stays.

**Word count** = the sum of `Chapter.wordCount` over the chapters being
exported (so it respects "Include outline chapters"). Rounded per decision 6.
A count that rounds to 0 shows `about 100 words` *(my call: a floor of 100)*.

## Data

**Writer defaults**: new optional sub-document on `Settings`:

```js
manuscript: {
  authorName: String,     // byline name ("J. Q. Ward")
  surname: String,        // header surname ("Ward")
  contactBlock: String,   // multi-line free text
  font: 'serif' | 'mono', // last font used
}
```

No schema defaults; unset means "not chosen yet".

**Work override**: new optional sub-document on `Work`:

```js
manuscript: {
  override: { authorName, surname, contactBlock } | absent,
  headerTitle: String | absent,   // free text; printed in capitals
}
```

`headerTitle` is always per work (it isn't part of the override).

**Resolving what applies to a work** (one server function, used by both the
prefill and the export):

1. If the work has `manuscript.override`, use its three fields as they are,
   with no fallback to the writer's defaults (decision 12).
2. Else use the writer's `Settings.manuscript` fields.
3. Then, from whichever set applied: an empty `surname` → the last
   whitespace-separated word of the resolved `authorName`; an empty
   `contactBlock` stays empty. An empty `authorName` → `User.name`; this
   only happens before the writer has ever saved details, because saving
   requires an author name (see API).
4. `headerTitle` → `Work.manuscript.headerTitle`, else the work title.
5. `font` → `Settings.manuscript.font`, else `serif`.

## API

**Prefill**: `GET /api/works/:workId/export/manuscript` (behind `loadWork`,
like the rest of the export router) returns

```json
{ "authorName": "…", "surname": "…", "contactBlock": "…",
  "headerTitle": "…", "font": "serif", "workOnly": false }
```

`workOnly` is `true` when the work has an override.

**Export**: `POST /api/works/:workId/export` gains two optional body fields:

- `layout`: `'reading'` (default) or `'manuscript'`. Anything else → 400
  `UNSUPPORTED_LAYOUT`. `'manuscript'` with `format: 'epub'` → 400
  `UNSUPPORTED_LAYOUT`.
- `manuscript`: `{ authorName, surname, contactBlock, headerTitle, font,
  workOnly }`, used only with `layout: 'manuscript'`.

With `layout: 'manuscript'` the route first saves the details, then exports.
**Partial bodies** *(my call)*: with no `manuscript` object the route saves
nothing and exports with the stored details. A field absent from the object
(as opposed to sent as `""`) keeps its current value: the value already in
the set being written, or, when an override is being created, the value the
work currently resolves to. So an API caller can't blank the writer's
defaults by accident. The modal always sends every field.
**Author name is required** *(my call)*: after merging, an empty
`authorName` → 400 `VALIDATION_ERROR` (a manuscript needs a byline). The
modal disables Export while it's blank.

- `workOnly: true` → write `Work.manuscript.override` with the three fields.
- `workOnly: false` → write them to `Settings.manuscript` and remove
  `Work.manuscript.override`.
- `headerTitle` → `Work.manuscript.headerTitle` (an empty string or one equal
  to the work title clears it, so a later title change still flows through).
- `font` → `Settings.manuscript.font`. Not `'serif'`/`'mono'` → 400
  `VALIDATION_ERROR`.
- Strings are trimmed; length caps: names and header title 200 chars, contact
  block 1,000 chars and 10 lines → 400 `VALIDATION_ERROR` past that.
- `includeNotes` is ignored for the manuscript layout.

The export then resolves the details again (so it uses exactly what was
saved) and calls the manuscript builder. Saving runs even if the build then
fails; that's fine, since the writer's input is kept either way.

The general `PUT /api/works/:workId` copies its body straight onto the work,
so it would also accept a `manuscript` field. Leave that as it is; the export
route is the only writer the UI uses.

## Server structure

- `exportService.exportWork(workId, format, options)` gains
  `options.layout` and `options.manuscript` (the resolved details). With
  `layout: 'manuscript'` it calls new `buildManuscriptPDF(meta, chapters,
  details)` / `buildManuscriptDOCX(…)`; otherwise the existing builders, unchanged.
- The manuscript code goes in a new `server/src/services/manuscriptExport.js`
  so `exportService.js` stays readable. Pure helpers (word-count rounding,
  surname fallback, header text, resolving details) are exported for unit
  tests.
- `MANUSCRIPT_SCENE_BREAK = '#'`; the reading `SCENE_BREAK` stays `* * *`.

**DOCX** (the `docx` library, already a dependency): one section with
`properties.titlePage: true`, an empty `headers.first`, and a `headers.default`
paragraph right-aligned holding the header text plus `PageNumber.CURRENT`.
Page size and margins on the section; the font, size and double spacing set
in the document's default paragraph/run styles so every paragraph inherits
them. Chapter titles use `pageBreakBefore` and enough space before to land a
third of the way down. Title page through tab stops or a two-cell borderless
layout for the top line, at the builder's choice.

**PDF** (pdfkit, already a dependency): the built-in standard fonts
`Times-Roman` and `Courier`, so nothing is embedded. Letter size, 72 pt
margins, `lineGap` set for double spacing, `indent` for first-line indents.
Headers are drawn once all pages exist (`bufferPages: true`, then
`switchToPage` for pages 2…n), with the bottom margin handled so drawing in
the top margin doesn't add pages.

## Client

`ExportModal.jsx`:

- A **Layout** selector (Reading / Manuscript), shown for PDF and DOCX.
  Choosing EPUB hides it and exports Reading.
- When Manuscript is chosen: fetch the prefill once (per modal open), then
  show Font (Serif / Mono), Author name, Surname (for the header), Contact
  block (textarea), Header title, and an "Only for this work" checkbox.
  "Include chapter notes" is hidden; "Include outline chapters" stays.
- A short hint under the fields says the details are saved when you export.
- The export button sends `layout` and, for manuscript, the `manuscript`
  object. Errors show where they do today.
- Opening the modal starts on Reading, as today *(my call: the layout choice
  isn't remembered)*.

## Testing (A6)

Server unit tests (`node --test`) generate real documents and inspect them:

- **DOCX:** unzip the buffer (jszip is already installed as a dependency of
  `docx`; add it as a direct devDependency) and check `word/document.xml`,
  `word/styles.xml`, the header parts and `word/settings.xml` for each rule:
  font and 24 half-point size, double spacing (`w:line="480"`), 1440-twip
  margins and Letter page size, first-line indent present on body paragraphs
  and absent after chapter titles and breaks, centred `#` paragraphs, page
  breaks before chapters, the title-page text (contact block lines, rounded
  count, capitalised title, byline), `END`, the title-page header setting, and
  the default header's text and PAGE field.
- **PDF:** build with `compress: false` in tests and check the text and font
  operators (or another inspection approach the builder prefers) for: Letter
  page size, the chosen standard font at 12 pt, the header text with the
  right page number on pages 2…n and nothing on page 1, `#` breaks, chapters
  starting on new pages, the title page content and `END`.
- Unit tests for word-count rounding (99, 4,949, 4,950, 9,999, 10,000,
  87,499, 87,500), the surname fallback, header text and detail resolution.
- **Reading unchanged (A1):** a test that an export without `layout` (and
  with `layout: 'reading'`) goes through the existing builders, and the
  existing reading tests stay as they are.
- HTTP tests (in-memory Mongo, `server/test/support/http.js`) for the prefill
  route, saving with `workOnly` true/false (override written / cleared),
  validation errors, `layout: 'manuscript'` with EPUB refused, and another
  user's work → 404.
- Client tests (`linkedom`): the layout selector shows only for PDF/DOCX, the
  manuscript fields appear and prefill, notes is hidden, and the request body
  carries `layout` and the details.

## Calls I made (check these)

- US Letter page size rather than A4. Letter is the standard for
  manuscript-format submissions; A4 would be a later option if needed.
- A word-count floor of `about 100 words`.
- Page numbering counts the title page as 1, so the first header shows `2`.
- The layout choice isn't remembered between modal opens; the font is.
- PDF uses pdfkit's standard Times/Courier fonts, which (like the current
  Helvetica reading PDF) only cover Western European characters. Text in
  other scripts will print wrong in the PDF; DOCX is unaffected. Fixing that
  means embedding a font and is out of scope.
- Details are saved by the export request itself rather than a separate save
  call, so one click both saves and downloads.
- Fields missing from an export request keep their saved values; a request
  with no details saves nothing.
- Author name can't be saved blank, so the byline is never empty and a
  pen-name override never falls back to the account name.

## Left to the builder

- How the DOCX title-page top line is laid out (tab stop vs. table).
- How to measure "a third of the way down" in each format.
- The PDF inspection approach in tests.
- The exact copy for labels and hints in the modal.
