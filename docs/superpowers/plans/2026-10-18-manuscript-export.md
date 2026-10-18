# Manuscript-Format Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Manuscript layout (standard submission format) to DOCX and PDF export, next to the unchanged Reading layout, with writer-set author details saved per writer and overridable per work.

**Architecture:** Pure helpers and the two manuscript builders live in a new `server/src/services/manuscriptExport.js`; saving/resolving the details lives in `server/src/services/manuscriptDetails.js`. `exportWork` branches on `options.layout` and leaves the reading builders untouched. The export router gains `GET /manuscript` (prefill) and saves details before a manuscript export. `ExportModal.jsx` gets a layout selector and the details fields.

**Tech Stack:** Node ESM, Express, Mongoose, `docx` 8.5, `pdfkit` 0.15, React 18, `node --test`, `supertest` + in-memory Mongo, `linkedom` client tests.

**Spec:** `docs/superpowers/specs/2026-10-18-manuscript-export-design.md`

**Card:** https://trello.com/c/IgGF9LxQ/28-export-docx-and-pdf-in-manuscript-format

## Global Constraints

- Reading layout output must not change: `buildPDF`, `buildDOCX`, `buildEPUB`, `docxBody`, `chapterToHTML`, `SCENE_BREAK` stay as they are.
- Page: US Letter (DOCX 12240 × 15840 twips; PDF `size: 'LETTER'`, 612 × 792 pt). Margins 1 in (1440 twips / 72 pt).
- Fonts: `serif` → DOCX `Times New Roman`, PDF `Times-Roman`; `mono` → DOCX `Courier New`, PDF `Courier`. 12 pt (DOCX size 24 half-points).
- Double spacing: DOCX `line: 480` (auto); PDF baseline-to-baseline 24 pt.
- First-line indent 0.5 in (720 twips / 36 pt) on body paragraphs; none on a chapter's first paragraph or the first paragraph after a scene break.
- Scene break: a centred paragraph holding only `#` (`MANUSCRIPT_SCENE_BREAK = '#'`).
- Chapter title: new page, centred, ~1/3 down; then one blank double-spaced line, then text.
- `END` centred after the last chapter, after one blank line.
- Running header `Surname / HEADER TITLE / n`, right-aligned, 0.5 in from the top edge, same font, on every page except the title page; title page is page 1, so the first header reads `/ 2`.
- Title page: contact block top-left (single-spaced, as typed), `about N words` top-right on the first line, title in capitals centred ~halfway, blank line, `by <authorName>`. No header.
- Word count: sum of `Chapter.wordCount` over exported chapters; `< 10,000` → nearest 100, `≥ 10,000` → nearest 1,000, floor 100; formatted `about 87,000 words` (`en-US` grouping).
- Chapter notes are never printed in the manuscript layout.
- Validation caps: `authorName`, `surname`, `headerTitle` ≤ 200 chars; `contactBlock` ≤ 1,000 chars and ≤ 10 lines; `font` ∈ `serif|mono`; `authorName` non-empty after merging. Errors: 400 `VALIDATION_ERROR`; bad layout or manuscript+EPUB: 400 `UNSUPPORTED_LAYOUT`.
- Commits: Conventional Commits, body ends with `Trello: https://trello.com/c/IgGF9LxQ/28-export-docx-and-pdf-in-manuscript-format` and the session's `Co-Authored-By:` line.
- Run tests from the worktree: `cd server && npm test`, `cd client && npm test` (single file: `node --test test/<file>.test.js` in that package).

## Review Focus

1. **A chapter long enough to span several pages** — every page after the title page, including mid-chapter pages, carries the header with its own page number. Test in Task 3 (DOCX: header is a section default, so assert one default header part) and Task 4 (PDF: a 3+ page chapter).
2. **A work with no exportable chapters** (empty, or only outline chapters) — manuscript still builds: title page with `about 100 words`, then `END`. Tests in Tasks 3 and 4.
3. **Characters outside Western European** (curly quotes, em dash, `東京`) in PDF — export completes without throwing (the glyphs may print wrong; that's the accepted limitation). Test in Task 4.
4. **A paragraph holding line breaks (`\n`)** — the break is kept and the paragraph still gets one first-line indent. Test in Task 3.
5. **Another writer's work** — prefill and manuscript export both 404 and save nothing. Test in Task 5.

---

### Task 1: Pure manuscript helpers  (→ S4, S5, S6)

**Files:**
- Create: `server/src/services/manuscriptExport.js`
- Test: `server/test/manuscriptHelpers.test.js`

**Interfaces:**
- Produces (all exported from `manuscriptExport.js`):
  - `MANUSCRIPT_SCENE_BREAK = '#'`
  - `roundWordCount(n: number) -> number`
  - `formatWordCount(n: number) -> string` — `'about 87,000 words'` (rounds first)
  - `defaultSurname(authorName: string) -> string` — last whitespace-separated word, `''` for blank
  - `headerText({ surname, headerTitle }, page: number) -> string` — `'Ward / GLASS ORCHARD / 2'`
  - `resolveManuscriptDetails({ settings, work, userName }) -> { authorName, surname, contactBlock, headerTitle, font, workOnly }` where `settings` is `Settings.manuscript` (or undefined), `work` is a plain work object (`title`, optional `manuscript: { override, headerTitle }`), `userName` is `User.name`.

- [ ] **Step 1: Write the failing tests**

```js
test('roundWordCount: nearest 100 under 10k, nearest 1,000 from 10k, floor 100', () => {
  for (const [n, want] of [[0,100],[99,100],[4949,4900],[4950,5000],[9999,10000],[10000,10000],[87499,87000],[87500,88000]])
    assert.equal(roundWordCount(n), want, `n=${n}`);
});
test('formatWordCount', () => assert.equal(formatWordCount(87420), 'about 87,000 words'));
test('defaultSurname', () => {
  assert.equal(defaultSurname('J. Q. Ward'), 'Ward');
  assert.equal(defaultSurname('  Ward  '), 'Ward');
  assert.equal(defaultSurname(''), '');
});
test('headerText capitalises the header title', () =>
  assert.equal(headerText({ surname: 'Ward', headerTitle: 'Glass Orchard' }, 2), 'Ward / GLASS ORCHARD / 2'));
```

`resolveManuscriptDetails` cases (one `test` each):
- no settings, no override → `authorName` = `userName`, `surname` = last word of it, `contactBlock` `''`, `headerTitle` = work title, `font` `'serif'`, `workOnly` false.
- settings `{ authorName: 'J. Q. Ward', contactBlock: 'Jane\njane@x', font: 'mono' }` → those values, `surname` `'Ward'`.
- override `{ authorName: 'Pen Name', surname: '', contactBlock: '' }` with settings holding a contact block → `contactBlock` `''` (blank means blank), `surname` `'Name'`, `workOnly` true.
- `work.manuscript.headerTitle: 'Orchard'` → `headerTitle` `'Orchard'`; `font` still comes from settings even with an override.

- [ ] **Step 2: Run** `cd server && node --test test/manuscriptHelpers.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement the helpers** in `manuscriptExport.js`. Resolution order exactly as spec "Data → Resolving"; an override is used whole (no per-field fallback to settings), empty surname → `defaultSurname(authorName)`, empty authorName → `userName`.
- [ ] **Step 4: Run** the file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(export): add manuscript format helpers`

---

### Task 2: Stored details: schema and save/resolve service  (→ S4, S6)

**Files:**
- Modify: `server/src/models/Settings.js` (add `manuscript: { type: mongoose.Schema.Types.Mixed }`, no default)
- Modify: `server/src/models/Work.js` (same, `manuscript` Mixed, no default)
- Create: `server/src/services/manuscriptDetails.js`
- Test: `server/test/manuscriptDetails.test.js` (in-memory Mongo via `startDb`/`clearDb` from `test/support/http.js`)

**Interfaces:**
- Consumes: `resolveManuscriptDetails` (Task 1); `getSettings`/`saveSettings` from `settingsService.js` (`saveSettings` deep-merges a partial).
- Produces:
  - `getManuscriptDetails(work, userId) -> Promise<details>` — loads `Settings` and the `User` name (`User.findById(userId).select('name')`), returns `resolveManuscriptDetails(...)`. `work` is the Mongoose doc or plain object from `loadWork`.
  - `saveManuscriptDetails(work, userId, input) -> Promise<void>` — `input` may be `undefined` (no-op) or `{ authorName?, surname?, contactBlock?, headerTitle?, font?, workOnly? }`. Throws `httpError(400, 'VALIDATION_ERROR', …)`.

Save rules (spec "API"): trim strings; a field absent from `input` keeps its current value (from the set being written; when creating an override, from what the work currently resolves to); validate caps, `font`, and non-empty merged `authorName` **before writing anything**; `workOnly: true` → `Work.manuscript.override = { authorName, surname, contactBlock }`; `workOnly: false` → `saveSettings(userId, { manuscript: {…three fields} })` and unset `Work.manuscript.override`; `headerTitle` `''` or equal to the work title → unset `Work.manuscript.headerTitle`, else set it; `font` → `Settings.manuscript.font`. Absent `workOnly` keeps the work's current mode. Use `Work.updateOne({ _id: work.id ?? work._id }, { $set / $unset })` so other work fields aren't touched.

- [ ] **Step 1: Write the failing tests**, one each:
  - `workOnly:false` writes Settings.manuscript and `getManuscriptDetails` returns them for another work of the same writer.
  - `workOnly:true` writes the override only; a second work still resolves to the writer defaults; `getManuscriptDetails` on the first returns `workOnly: true`.
  - then `workOnly:false` on that work clears its override (`Work.findById(...).lean().manuscript.override` is undefined).
  - partial input `{ authorName: 'New' }` keeps the saved `contactBlock`; `input` undefined writes nothing (Settings doc still absent).
  - creating an override with input `{ workOnly: true, authorName: 'Pen' }` copies the current resolved `contactBlock` into it.
  - `headerTitle` equal to the work title, or `''`, leaves `manuscript.headerTitle` unset.
  - each rejects with `code === 'VALIDATION_ERROR'` and writes nothing: `authorName: '  '`; 201-char `surname`; `contactBlock` with 11 lines; 1,001-char `contactBlock`; `font: 'sans'`.
- [ ] **Step 2: Run** `node --test test/manuscriptDetails.test.js` — Expected: FAIL.
- [ ] **Step 3: Add the schema fields and implement the service.**
- [ ] **Step 4: Run** the file, then the full server suite — Expected: PASS, nothing else broken (backup tests serialise the whole work, so they must still pass).
- [ ] **Step 5: Commit** `feat(export): store manuscript details per writer and per work`

---

### Task 3: DOCX manuscript builder  (→ S2, S4, S5, S6)

**Files:**
- Modify: `server/src/services/manuscriptExport.js`
- Test: `server/test/manuscriptDocx.test.js` (use `unzip` from `test/support/zip.js`)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `buildManuscriptDOCX({ title, chapters, details, wordCount }) -> Promise<Buffer>` where `chapters` is `[{ title, scenes: string[][] }]` (the `exportScenes` shape; `\n` inside a paragraph = line break), `details` is the resolved details object, `wordCount` the unrounded sum.

Pinned layout values: section `properties.titlePage: true`, `page.size` 12240 × 15840, `page.margin` 1440 all round with `header: 720`; document default style run `font` + `size: 24`, paragraph `spacing: { line: 480 }`; body paragraphs `indent: { firstLine: 720 }`; chapter title paragraph `pageBreakBefore: true`, centred, `spacing: { before: 3840 }`, followed by one empty paragraph; scene break and `END` paragraphs centred with no indent; `END` preceded by one empty paragraph; title page: first line `contactBlock` line 1 + tab + word count with a right tab stop at 9360, remaining contact lines as single-spaced paragraphs (`spacing: { line: 240 }`), then the capitalised title centred with `spacing: { before: 4320 }`, an empty paragraph, `by <authorName>` centred; `headers.first` an empty `Header`, `headers.default` a right-aligned paragraph: the text `Ward / GLASS ORCHARD / ` (`headerText` without the number) followed by `PageNumber.CURRENT`.

- [ ] **Step 1: Write the failing tests.** Build once with `title: 'The Glass Orchard'`, details `{ authorName: 'J. Q. Ward', surname: 'Ward', contactBlock: 'Jane Writer\n12 Some Street\njane@example.com', headerTitle: 'Glass Orchard', font: 'serif' }`, `wordCount: 87420`, chapters `[{ title: 'One', scenes: [['A1', 'A2 line\nbreak'], ['B1']] }, { title: 'Two', scenes: [['C1']] }]`; read `word/document.xml`, `word/styles.xml`, `word/settings.xml` and the header parts. One test per rule:
  - **font/size/spacing:** styles.xml has `w:ascii="Times New Roman"`, `<w:sz w:val="24"/>`, `w:line="480"`; with `font:'mono'`, `Courier New`.
  - **page/margins:** document.xml `<w:pgSz w:w="12240" w:h="15840"`, `<w:pgMar` with `w:top="1440"` `w:right="1440"` `w:bottom="1440"` `w:left="1440"`.
  - **indents:** the paragraphs holding `A1` and `B1` and `C1` have no `w:firstLine`; `A2` has `w:firstLine="720"`; `A2`'s paragraph contains a `<w:br/>` (Review Focus 4).
  - **scene break:** a paragraph whose only text is `#`, with `w:jc w:val="center"`, between `A2` and `B1`; no `* * *` anywhere.
  - **chapters:** the paragraphs holding `One` and `Two` have `<w:pageBreakBefore/>`, `w:jc center`, `w:before="3840"`.
  - **title page:** text contains each contact line, `about 87,000 words`, `THE GLASS ORCHARD`, `by J. Q. Ward`; first page has no page-break before the title block.
  - **END:** the last text paragraph is `END`, centred.
  - **header:** `<w:titlePg/>` in the section; the default header part contains `Ward / GLASS ORCHARD / ` and a `PAGE` field; the first-page header part has no text.
  - **notes never printed:** a chapter object with `notes: 'secret'` → `secret` not in document.xml.
  - **empty work** (Review Focus 2): `chapters: []`, `wordCount: 0` → builds; contains `about 100 words` and `END`.
- [ ] **Step 2: Run** `node --test test/manuscriptDocx.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement `buildManuscriptDOCX`** with the `docx` API (`Document`, `Header`, `Paragraph`, `TextRun`, `PageNumber`, `TabStopType`, `AlignmentType`).
- [ ] **Step 4: Run** — Expected: PASS. If a pinned XML attribute comes out spelled differently in docx 8.5, assert what docx emits for the same setting and note it in the report.
- [ ] **Step 5: Commit** `feat(export): build DOCX in manuscript format`

---

### Task 4: PDF manuscript builder  (→ S3, S4, S5, S6)

**Files:**
- Modify: `server/src/services/manuscriptExport.js`
- Create: `server/test/support/pdf.js`
- Test: `server/test/manuscriptPdf.test.js`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `buildManuscriptPDF({ title, chapters, details, wordCount }, { compress = true } = {}) -> Promise<Buffer>` (same inputs as Task 3; tests pass `{ compress: false }`).
- Test helper `parsePdf(buffer) -> { pages: [{ width, height, runs: [{ text, x, y, font, size }] }] }`, pages in document order (follow the `/Pages` `/Kids` array), `y` measured from the **top** of the page, `font` the `/BaseFont` name (e.g. `Times-Roman`), `text` the decoded string of each `TJ`/`Tj` (pdfkit writes standard-font text as hex WinAnsi), `x`/`y` from the preceding `Tm`.

PDF approach: `new PDFDocument({ size: 'LETTER', margins: 72 each side, bufferPages: true, compress, autoFirstPage: true })`; body lines at 24 pt baseline-to-baseline (set `lineGap` from the font's line height); `indent: 36` on body paragraphs; draw headers last with `switchToPage(i)` for `i ≥ 1` at `y = 36`, right-aligned in the 72–540 pt band, temporarily zeroing the bottom margin so drawing doesn't add pages. Chapter title y ≈ 72 + 192 = 264; title-page title y ≈ 396.

- [ ] **Step 1: Write the failing tests** (same fixture as Task 3, plus a long chapter of 60 paragraphs of ~80 words so it spans 3+ pages), one per rule:
  - **page/font:** every page is 612 × 792; every body run has `font: 'Times-Roman'`, `size: 12` (`font:'mono'` → `Courier`).
  - **margins:** all body runs have `x ≥ 72 - 0.5`, `y ≥ 72 - 0.5` and `y ≤ 720 + 0.5` (header runs excluded).
  - **double spacing:** consecutive lines of a wrapped body paragraph differ in `y` by 24 ± 0.5.
  - **indents:** `A2`'s first run `x ≈ 108`; `A1`, `B1`, `C1` runs `x ≈ 72`; the line after the `\n` in `A2` is at `x ≈ 72`.
  - **scene break:** a run `#` horizontally centred (`x > 290 && x < 310`; the page centre is 306); no `* * *`.
  - **chapters:** `One` and `Two` each are the first non-header run on their own page, `y` within 0.30–0.40 of page height.
  - **title page:** page 1 has the contact lines, `about 87,000 words` (right side, `x > 306`), `THE GLASS ORCHARD` with `y` within 0.45–0.55 of page height, `by J. Q. Ward`; no header run.
  - **header** (Review Focus 1): every page `i ≥ 2` (1-based) has a run `Ward / GLASS ORCHARD / i` with `y < 72`; page 1 has none; with the long chapter there are ≥ 4 pages.
  - **END:** the last run of the last page (excluding header) is `END`.
  - **empty work** (Review Focus 2): builds, page 1 has `about 100 words`, `END` follows.
  - **non-Latin text** (Review Focus 3): a paragraph `“Ægir” — 東京` builds without throwing.
- [ ] **Step 2: Run** `node --test test/manuscriptPdf.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement `parsePdf` and `buildManuscriptPDF`.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(export): build PDF in manuscript format`

---

### Task 5: Wire layout into exportWork and the export routes  (→ S1, S2, S3, S6)

**Files:**
- Modify: `server/src/services/exportService.js` (`exportWork` only)
- Modify: `server/src/routes/export.js`
- Test: `server/test/export.routes.test.js` (own express app like `backup.routes.test.js`, mounting the export router at `/api/works/:workId/export`)

**Interfaces:**
- Consumes: `buildManuscriptDOCX`, `buildManuscriptPDF` (Tasks 3–4), `getManuscriptDetails`, `saveManuscriptDetails` (Task 2).
- Produces:
  - `exportWork(workId, format, { includeNotes, includeOutline, layout = 'reading', manuscript })` — with `layout === 'manuscript'`: chapters filtered by `includeOutline` as today, `notes` dropped, `wordCount` = sum of `wordCount` of the exported chapters, then the manuscript builder for `pdf`/`docx` with `manuscript` as `details`; otherwise the existing path unchanged.
  - `GET /api/works/:workId/export/manuscript` → `200` details JSON (`getManuscriptDetails(req.work, req.user.id)`).
  - `POST /api/works/:workId/export` accepts `layout` and `manuscript`; validates layout (`reading|manuscript`, manuscript not with `epub`) → 400 `UNSUPPORTED_LAYOUT` before anything is saved; for manuscript: `saveManuscriptDetails(req.work, req.user.id, req.body.manuscript)`, then `getManuscriptDetails` again (re-read the work), then `exportWork(..., { layout, manuscript: details })`.

- [ ] **Step 1: Write the failing tests** (seed a `User` named `Jane Q. Writer` for `user_a`, a work owned by `user_a` with two chapters of known `wordCount` and one outline chapter with `wordCount: 0`):
  - **prefill:** GET returns `{ authorName: 'Jane Q. Writer', surname: 'Writer', contactBlock: '', headerTitle: <work title>, font: 'serif', workOnly: false }`.
  - **reading unchanged (A1):** POST `{ format: 'docx' }` and `{ format: 'docx', layout: 'reading' }` → document.xml contains `* * *` between scenes and no `<w:titlePg/>`; POST `{ format: 'pdf' }` → 200 `application/pdf`.
  - **manuscript docx/pdf:** POST `{ format: 'docx', layout: 'manuscript', manuscript: {…full set, workOnly: false} }` → 200, document.xml has `<w:titlePg/>` and the rounded word count of the two chapters; then GET prefill returns the saved values. Same for `pdf` → 200 `application/pdf`.
  - **override:** POST with `workOnly: true` → GET on this work returns `workOnly: true`; GET on a second work of `user_a` returns the defaults.
  - **notes ignored:** `includeNotes: true` with manuscript → chapter notes text absent.
  - **errors:** `layout: 'fancy'` → 400 `UNSUPPORTED_LAYOUT`; `{ format: 'epub', layout: 'manuscript' }` → 400 `UNSUPPORTED_LAYOUT` and Settings unchanged; `font: 'sans'` → 400 `VALIDATION_ERROR`.
  - **ownership** (Review Focus 5): as `user_b`, GET prefill and manuscript POST on `user_a`'s work → 404, and `user_a`'s settings/work unchanged.
- [ ] **Step 2: Run** `node --test test/export.routes.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then the full server suite — Expected: PASS, including the untouched `exportService.test.js`.
- [ ] **Step 5: Commit** `feat(export): add manuscript layout to the export API`

---

### Task 6: Export modal: layout selector and details fields  (→ S1, S6)

**Files:**
- Modify: `client/src/components/overlays/ExportModal.jsx`
- Modify: `client/src/index.css` (only if the fields need layout styles; reuse `form-group`, `form-label`, `format-selector`, `format-btn`, `checkbox-label`, `form-hint`)
- Test: `client/test/exportModal.test.js` (reuse the `Driver` pattern from `backupModal.test.js`, `renderApp` with `routes`)

**Interfaces:**
- Consumes: `GET /works/:id/export/manuscript` and the POST body from Task 5.
- Produces: request body `{ format, includeNotes, includeOutline, layout, manuscript? }`; `manuscript` = `{ authorName, surname, contactBlock, headerTitle, font, workOnly }`, sent only when `layout === 'manuscript'`; `includeNotes` sent as `false` for manuscript.

UI rules (spec "Client"): a Layout selector (Reading / Manuscript, `format-btn` buttons) shown for PDF and DOCX only; picking EPUB hides it and the export uses `layout: 'reading'`. Manuscript shows Font (Serif / Mono), Author name, Surname (for the header), Contact block (textarea), Header title, and an "Only for this work" checkbox, prefilled from the GET (fetched once per modal open, the first time Manuscript is picked); a hint that details are saved when you export; "Include chapter notes" hidden; Export disabled while Author name is blank or the prefill is loading. Modal opens on Reading. Use `data-testid`s: `layout-reading`, `layout-manuscript`, `ms-author`, `ms-surname`, `ms-contact`, `ms-header-title`, `ms-font-serif`, `ms-font-mono`, `ms-work-only`.

- [ ] **Step 1: Write the failing tests:**
  - layout buttons visible for PDF (default) and DOCX, gone after clicking EPUB.
  - clicking Manuscript fetches `GET /works/work_a/export/manuscript` once and fills the fields from the reply (`workOnly: true` → checkbox ticked); "Include chapter notes" is no longer in the text, "Include outline chapters" still is.
  - editing Author name and ticking Mono then exporting POSTs `/works/work_a/export` with `layout: 'manuscript'`, `includeNotes: false` and the full `manuscript` object including the edits.
  - Reading export POSTs `layout: 'reading'` and no `manuscript` key.
  - clearing Author name disables the Export button.
- [ ] **Step 2: Run** `cd client && node --test test/exportModal.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** in `ExportModal.jsx`.
- [ ] **Step 4: Run** the file, then the full client suite — Expected: PASS (`backupModal.test.js` included).
- [ ] **Step 5: Commit** `feat(export): offer manuscript layout in the export modal`

---

## Coverage

| Subtask | Tasks |
|---|---|
| S1 Layout option in the Export modal | 5, 6 |
| S2 DOCX manuscript | 3, 5 |
| S3 PDF manuscript | 4, 5 |
| S4 Title page and contact block | 1, 2, 3, 4 |
| S5 Running header | 1, 3, 4 |
| S6 Tests | 1–6 |

| Criterion | Proven by |
|---|---|
| A1 Manuscript or Reading for DOCX/PDF; Reading as before | `export.routes.test.js` "reading unchanged" + "manuscript docx/pdf"; `exportModal.test.js` layout-selector tests; unchanged `exportService.test.js` passes |
| A2 Format rules | `manuscriptDocx.test.js` font/page/indents/scene break/chapters; `manuscriptPdf.test.js` page/font/margins/double spacing/indents/scene break/chapters |
| A3 Title page | `manuscriptHelpers.test.js` rounding; title-page tests in `manuscriptDocx.test.js` and `manuscriptPdf.test.js` |
| A4 Running header | header tests in `manuscriptDocx.test.js` and `manuscriptPdf.test.js` (incl. multi-page chapter) |
| A5 Writer sets contact block and surname | `manuscriptDetails.test.js`; `export.routes.test.js` save/override/prefill; `exportModal.test.js` edit-and-export |
| A6 Tests check structure per rule | all of the above; full `npm test` in server and client green |
