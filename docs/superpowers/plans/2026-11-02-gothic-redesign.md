# Gothic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved gothic design (three palettes, self-hosted fonts, palette selector, EB Garamond 19 editor default) into the classic UI without changing behaviour.

**Architecture:** Tokens live in `client/src/index.css`, split into three palette blocks selected by `data-palette` on `<html>`. The palette is stored on the account (`Settings.palette`), cached in `localStorage`, and applied before first paint by an inline script. The app's existing CSS classes are restyled from the artifact CSS; none are renamed. Hard-coded colours and fonts are swept into tokens, then each room is restyled in its own commit.

**Tech Stack:** React 18 + Vite 5, plain CSS, Express + Mongoose, `node --test` with `linkedom`, `@fontsource/*` packages. Visual checks use the Playwright browser tools in-session (not added to the repo).

**Spec:** `docs/superpowers/specs/2026-11-02-gothic-redesign-design.md`. Design handoff: `docs/design/gothic-design-system.md` (its Palettes table is the source for every token value; do not retype it from memory).

## Global Constraints

- Branch `feat/uqVctsf5-apply-gothic-redesign`, one PR, commits in plan order. Every commit leaves `npm --prefix client test` and `npm --prefix server test` green.
- Commits: Conventional Commits, ≤72 chars, body ends `Trello: https://trello.com/c/uqVctsf5/105-apply-the-gothic-redesign-to-the-classic-ui`, then the `Co-Authored-By:` line naming the model that wrote the code and the `Claude-Session:` line (see `docs/agent-workflow.md`).
- Token names and values are exactly the handoff's Palettes table; new tokens are `--accent`, `--accent-hover`, `--glass-1`, `--glass-2`, `--glow`. Palette blocks: `:root, [data-palette="votive"]`, `[data-palette="nave"]`, `[data-palette="reliquary"]`. `data-palette` is on `<html>`.
- Radii `--radius` 2px, `--radius-sm` 1px, `--radius-lg` 3px. Fonts: Pirata One (display, never below about 23px), EB Garamond (writing text), Spectral (interface), as `--font-display`, `--font-reading`, `--font-ui`.
- Focus: the global 2px `--border-focus` ring with 2px offset, the inset ring for edge items, and the editor's 1px box-shadow exception stay exactly as `client/test/focusStyles.test.js` pins them. Busy buttons keep `aria-disabled`. Checkboxes and radios stay native inputs; wizard hooks stay `aria-pressed` buttons.
- No gradients, masks, filters, `backdrop-filter`, background images or box shadows inside `.editor-wrap` or `.editor` (apart from the existing 1px focus ring). The sidebar-only `--glow` and the quatrefoil masks stay out of the writing area.
- No Games Workshop names, logos or iconography. Mockup sample story text and values are invented and are never copied into the app. The app's wording and behaviour win over a mockup.
- Do not rename app CSS classes to the mockups' names. Map the design onto the existing classes.
- Cache key `scriptorium.palette`; palette names `votive`, `nave`, `reliquary`.
- Playwright scripts and screenshots live in the scratchpad, not in the repo.

## Review Focus

1. A cached palette that is missing, empty or not one of the three names (hand-edited or from an older build) must give Votive without an error (Task 3).
2. `localStorage` that throws on read or write (private window, blocked data) must still render Votive and still let the writer switch palette for the session (Task 3).
3. `PUT /settings` with `palette` as an unknown string, number, `null`, array or `''` must return 400 and store nothing; saving the daily goal or a provider key afterwards must not clear a stored palette (Task 2).
4. A failed palette save (500 or network error) must put the previous palette back and show an error, with no stale cache written (Task 4).
5. Opening and autosaving a chapter that has no explicit formatting, or has `<font size>`, must not rewrite its HTML because the default font changed; `span style="font-size: 19px"` must survive the server sanitizer (Task 7).

## Room recipe (used by Tasks 9 to 17)

Each restyle task follows these steps, with its own pins, files and boards:

- [ ] **R1.** Read the task's artifact boards and the CSS rules they use from the scratchpad copies made in Task 1.
- [ ] **R2.** Add the task's pin tests to `client/test/gothicStyles.test.js`; run `cd client && node --import ./test/support/register.js --test test/gothicStyles.test.js` and see the new tests FAIL.
- [ ] **R3.** Restyle the named `index.css` sections (and the named JSX) so the app's existing classes take the design's values from the artifact CSS. Replace any `font-family` or palette-coloured literal in the touched sections with tokens as you go.
- [ ] **R4.** Run `npm --prefix client test` and `npm --prefix server test`; both pass. If a CSS-pinning test (`focusStyles`, `mapLayout`, `contrast`) fails because a rule moved, update only its selector list.
- [ ] **R5.** Start the dev stack (CLAUDE.md "Running the app", `DEV_AUTH_BYPASS=true`). Screenshot each room in the task at 1024px and 1440px in Votive (and in Nave and Reliquary where the task says so), save to the scratchpad, compare with the board, and fix differences before committing.
- [ ] **R6.** Commit.

## File Structure

- Create: `client/src/utils/palette.js`, `client/test/palette.test.js`, `client/test/settingsPalette.test.js`, `client/test/gothicStyles.test.js`, `client/test/fonts.test.js`, `server/test/settingsPalette.routes.test.js`.
- Modify: `server/src/models/Settings.js`, `server/src/services/settingsService.js`, `server/src/routes/settings.js`, `client/index.html`, `client/package.json`, `client/src/main.jsx`, `client/src/index.css`, `client/src/context/AiContext.jsx`, `client/src/pages/Settings.jsx`, `client/src/components/editor/Toolbar.jsx`, `client/src/components/layout/{Sidebar,TopBar}.jsx`, `client/src/components/map/{TensionCurve,ChapterBlocks}.jsx`, `client/src/components/shelves/WorkCard.jsx`, `client/test/{contrast,toolbar}.test.js`, plus the room components named in Tasks 9 to 17.

---

### Task 1: Artifact copies and baselines (→ S6)

**Files:** none in the repo. Output goes to the scratchpad and the card.

- [ ] **Step 1:** With the `Artifact` tool `read` action on `https://claude.ai/artifact/E8oEsNutMUyWobkDTBJf1x`, fetch `project/gothic.css`, `screens.css`, `overlays.css`, `additions.css` and every `project/*.dc.html` board listed in `docs/design/gothic-design-system.md` (Screens table). Keep them in `<scratchpad>/artifact/`.
- [ ] **Step 2:** Try to render the boards locally (the design runtime is in the same artifact under `artifact-type/`). Note in the scratchpad whether it works; if not, the A1 page links to the artifact instead.
- [ ] **Step 3: Baseline for A5.** On the unchanged branch, start the dev stack, seed one work with a 150,000-word chapter through the API (script in the scratchpad), open it, and measure keydown-to-next-frame time for 300 typed characters with Playwright (`browser_run_code_unsafe`). Record median and p95 in `<scratchpad>/baseline-typing.json`.
- [ ] **Step 4: Baseline for sub-1024px.** Screenshot every room at 640px wide and record whether each scrolls sideways; save to `<scratchpad>/baseline-640/`.
- [ ] **Step 5:** Comment the numbers on the card. No commit.

### Task 2: Server palette field (→ S7)

**Files:** Modify `server/src/models/Settings.js`, `server/src/services/settingsService.js`, `server/src/routes/settings.js`. Test: `server/test/settingsPalette.routes.test.js` (copy the harness from `server/test/settingsKey.routes.test.js`).

**Interfaces:**
- Produces: `PALETTES` (`['votive','nave','reliquary']`) and `validatePalette(partial): HttpError | null` exported from `settingsService.js`; `GET /api/settings` always returns `palette`.

- [ ] **Step 1: Write the failing tests.**
  - `GET returns votive when nothing is stored`.
  - `PUT palette nave is stored per user`: `PUT {palette:'nave'}` as `user_a` gives 200 with `palette: 'nave'`; `Settings.findById('user_a')` holds `palette: 'nave'`; a later GET returns `nave`; `user_b` still reads `votive`.
  - `PUT rejects a bad palette`: for each of `'gold'`, `5`, `null`, `['nave']`, `''` the status is 400, `code` is `VALIDATION_ERROR`, and the stored palette is unchanged.
  - `saving the daily goal keeps the palette` and `saving a provider key keeps the palette`.
- [ ] **Step 2:** Run `cd server && node --test test/settingsPalette.routes.test.js`; expect FAIL.
- [ ] **Step 3:** Add `palette: { type: String }` (no default) to the schema. Implement `validatePalette(partial)` (null when `partial.palette === undefined`, else 400 `VALIDATION_ERROR` unless it is one of `PALETTES`). Call it in the `PUT` route next to `validateAiToggle`. Make `maskSettings` set `masked.palette = settings.palette ?? 'votive'`.
- [ ] **Step 4:** Run the new test, then `npm --prefix server test`; expect PASS.
- [ ] **Step 5:** Commit `feat(settings): store the writer's palette on the account`.

### Task 3: Client palette util, early script, sync (→ S7)

**Files:** Create `client/src/utils/palette.js`. Modify `client/index.html`, `client/src/context/AiContext.jsx`. Test: `client/test/palette.test.js`.

**Interfaces:**
- Produces, from `utils/palette.js`: `PALETTES`, `DEFAULT_PALETTE` (`'votive'`), `CACHE_KEY` (`'scriptorium.palette'`), `isPalette(v): boolean`, `readCachedPalette(): string` (validated, never throws), `rememberPalette(name): void` (never throws), `applyPalette(name): void` (sets `document.documentElement.dataset.palette`; an invalid name applies Votive), `syncPalette(name): void` (apply and remember an account value; ignores `undefined` and invalid values).
- Consumes: the `palette` field from Task 2.

- [ ] **Step 1: Write the failing tests.**
  - `readCachedPalette gives votive for missing, empty and unknown values` (`null`, `''`, `'gold'`).
  - `readCachedPalette and rememberPalette do not throw when localStorage throws` (replace `globalThis.localStorage` with an object whose `getItem` and `setItem` throw; reads give `votive`, writes are silent, `applyPalette('nave')` still sets the attribute).
  - `syncPalette applies and caches a valid account palette` and `syncPalette ignores undefined and unknown values`.
  - `index.html early script uses the same names and key`: read `client/index.html`, extract the array of names and the key from the inline script, and assert they equal `PALETTES` and `CACHE_KEY`.
  - `AiContext applies the account palette from the settings read`: render `AiProvider` with `GET /settings` returning `palette: 'reliquary'` and assert `document.documentElement.dataset.palette === 'reliquary'`; `setAiState({...,palette:'nave'})` switches it.
- [ ] **Step 2:** Run `cd client && node --import ./test/support/register.js --test test/palette.test.js`; expect FAIL.
- [ ] **Step 3:** Implement the util. Add the inline `<script>` to `client/index.html` before the module script: it reads `scriptorium.palette` inside `try/catch` and sets `document.documentElement.dataset.palette` only if the value is one of the three names. In `AiContext.jsx`, call `syncPalette(settings?.palette)` in `refresh` (on a successful read) and in `setAiState`; keep the existing state shape and a comment saying why the palette rides on this read (one settings request).
- [ ] **Step 4:** Run the new test and `npm --prefix client test`; expect PASS.
- [ ] **Step 5:** Commit `feat(client): apply and cache the writer's palette`.

### Task 4: Palette selector in Settings (→ S7)

**Files:** Modify `client/src/pages/Settings.jsx`. Test: `client/test/settingsPalette.test.js` (model on `client/test/settingsAi.test.js`, using `renderApp` from `support/app.js`).

**Interfaces:**
- Consumes: `PALETTES`, `applyPalette`, `readCachedPalette` from Task 3; `setAiState` from `useAiState()`; `PUT /settings`.
- Produces: an "Appearance" section at the top of the Settings page: a `role="radiogroup"` labelled by its heading, with one native `<input type="radio" name="palette">` and `<label>` per palette (Votive, Nave, Reliquary).

- [ ] **Step 1: Write the failing tests.**
  - `Settings shows three palette radios with the account's palette checked`.
  - `choosing a palette applies it at once and saves only palette`: after the click `document.documentElement.dataset.palette` is `nave` and the recorded request is `PUT /settings` with body exactly `{ palette: 'nave' }`; on success the cache holds `nave`.
  - `a failed save restores the previous palette and shows the error`: `PUT` replies with `HttpError(500, ...)`; the attribute is back to the old value, the old radio is checked, an error message shows, and the cache is unchanged.
  - `the radios are keyboard reachable` (a native radio group: all three share `name="palette"`).
- [ ] **Step 2:** Run the test; expect FAIL.
- [ ] **Step 3:** Add `choosePalette(next)` to `Settings.jsx`: apply `next` straight away, `api.put('/settings', { palette: next })`, then `setAiState(updated)`; on error call `applyPalette(previous)` and show the page error. Keep `handleSave` unchanged (it sends only named keys). Class names for the cards: `pick`, `pick-card` (styled in Task 15).
- [ ] **Step 4:** Run the new test and `npm --prefix client test`; expect PASS (`formLabels.test.js` must still pass: use `htmlFor` with `useId()`).
- [ ] **Step 5:** Commit `feat(settings): choose a palette in Settings`.

### Task 5: Palette tokens and the contrast test (→ S1)

**Files:** Modify `client/src/index.css` (token block, lines 1 to 40), `client/test/contrast.test.js`. Create `client/test/gothicStyles.test.js` with the helper below.

**Interfaces:**
- Produces: in `gothicStyles.test.js`, `rulesFor(selector)` and `declares(selector, pattern)` (same shape as `mapLayout.test.js`), used by Tasks 6 to 17.

- [ ] **Step 1: Rewrite the contrast test first.** Replace the single `:root` parse with a function that returns tokens per palette from the three blocks and fails with a clear message if one is missing. Run every existing check (text on every background, control borders 3:1, hierarchy, badge tints, dimmed text, selected block, control border tokens) once per palette. Add: `--text` on `--accent` and `--accent-hover` at 4.5:1, and `--gold-hover` as text on every background at 4.5:1. Keep the two "no hard-coded colours in jsx" tests as they are.
- [ ] **Step 2:** Run `cd client && node --import ./test/support/register.js --test test/contrast.test.js`; expect FAIL (palette blocks missing).
- [ ] **Step 3:** Replace the `:root` token block with the three palette blocks plus a non-palette `:root` block for fonts, type sizes, radii, sidebar and panel widths, and `--transition`, with values from the handoff. Rule-category badge tints stay as `rgba()` for now (Task 8 moves them to tokens). If a check fails for a palette, adjust only the badge tint alpha, not a token.
- [ ] **Step 4:** Run `npm --prefix client test`; expect PASS.
- [ ] **Step 5:** Commit `feat(client): add the three gothic palettes and check them`.

### Task 6: Self-host the fonts (→ S2; proves A3)

**Files:** Modify `client/package.json`, `client/src/main.jsx`, `client/src/index.css` (body and every `font-family`). Test: `client/test/fonts.test.js`.

- [ ] **Step 1: Write the failing tests.**
  - `the three Fontsource packages are client dependencies` (`@fontsource/pirata-one`, `@fontsource/eb-garamond`, `@fontsource/spectral`).
  - `main.jsx imports each face's Latin files` (Pirata One 400; EB Garamond 400, 400 italic, 700, 700 italic; Spectral 400 and 500).
  - `no third-party font host in index.html or index.css`: no `fonts.googleapis.com`, `fonts.gstatic.com` or `@import url(http`.
  - `every font-family in index.css is a token`: each declaration is `var(--font-display|reading|ui)`, with the editor's own font list in `Toolbar.jsx` exempt (it is not in the CSS) and `monospace`/`system-ui` allowed only where a rule already uses them for code or form controls (list the exceptions in the test).
- [ ] **Step 2:** Run `node --import ./test/support/register.js --test test/fonts.test.js`; expect FAIL.
- [ ] **Step 3:** `cd client && npm install @fontsource/pirata-one @fontsource/eb-garamond @fontsource/spectral`; add the imports to `main.jsx` before `index.css`; set `body` to `var(--font-ui)`; replace the 40 `font-family` lines with tokens (headings and titles to `--font-display` at the sizes in the handoff Type table; writing text to `--font-reading`).
- [ ] **Step 4:** Run `npm --prefix client test`; expect PASS. Then `cd client && npm run build` and `grep -rE "fonts\.(googleapis|gstatic)\.com" dist` returns nothing.
- [ ] **Step 5:** Confirm each package ships its SIL Open Font Licence file in `node_modules/@fontsource/<name>/LICENSE` and keep a line saying so for the PR body. Commit `feat(client): self-host Pirata One, EB Garamond and Spectral`.

### Task 7: EB Garamond 19 as the editor default (→ S8)

**Files:** Modify `client/src/components/editor/Toolbar.jsx`, `client/src/index.css` (`.editor`, `.toolbar` sections). Tests: `client/test/toolbar.test.js` (add), `server/test/htmlService.test.js` (add; create it if absent, following an existing server service test).

**Interfaces:**
- Produces: `FONTS = ['EB Garamond', 'Georgia', 'Arial', 'Verdana', 'Courier']`, `SIZES = [12, 14, 16, 18, 19, 20]`, selects defaulting to `EB Garamond` and `19`. Choosing 19 wraps the selection in `<span style="font-size: 19px">`; the other sizes keep their current `execCommand('fontSize', n)` mapping.

- [ ] **Step 1: Write the failing tests.**
  - `the font select lists EB Garamond first and defaults to it`; `the size select lists 19 and defaults to 19`.
  - `choosing 19 turns the font size 7 elements execCommand makes into span font-size 19px`: stub `execCommand` so a fontSize call inserts `<font size="7">text</font>` in the editor; after the change the editor holds `<span style="font-size: 19px">text</span>` and no `font[size="7"]`.
  - `choosing 18 still maps to execCommand fontSize 4` (existing mapping unchanged).
  - `the editor rule uses the reading font, 1.1875rem and line-height 1.7` (in `gothicStyles.test.js`).
  - Server: `sanitize keeps span style font-size 19px and font size attributes`.
  - `opening a chapter with no formatting does not change its HTML`: render the editor with `<p>plain</p>`, let autosave settle, and assert the saved body equals the input.
- [ ] **Step 2:** Run the new tests; expect FAIL.
- [ ] **Step 3:** Update `FONTS`, `SIZES`, `defaultValue`s and `setSize` in `Toolbar.jsx` (after the stubbed or real `execCommand('fontSize', false, 7)` for 19, convert `font[size="7"]` inside the editor into the span). Update `.editor` to `font-family: var(--font-reading); font-size: var(--type-reading); line-height: 1.7`.
- [ ] **Step 4:** Run `npm --prefix client test` and `npm --prefix server test`; expect PASS.
- [ ] **Step 5:** In Chromium (Playwright), select a sentence that sits inside a `<font size="4">` and pick 19; confirm its computed size is 19px. Note the result on the card.
- [ ] **Step 6:** Commit `feat(editor): make EB Garamond 19 the default font`.

### Task 8: Palette-driven colours instead of literals (→ S1, S5)

**Files:** Modify `client/src/components/map/{TensionCurve,ChapterBlocks}.jsx`, `client/src/components/shelves/WorkCard.jsx`, `client/src/index.css` (every `rgba()` line and `#e8a030`), `client/test/contrast.test.js`, `client/test/gothicStyles.test.js`.

- [ ] **Step 1: Write the failing tests.**
  - `no palette-coloured literals outside the palette blocks`: scan `index.css` and every `.jsx` for `rgba(...)` and `#hex` that are not black or white (scrims and shadows) and not a token; today this lists the 77 lines and the three components.
  - Contrast: the rule-category badge test and the selected-chapter-block test resolve tints per palette (the act colours are `--teal`, `--purple`, `--coral`; the old hex lookup in `ChapterBlocks.jsx` goes away). The Map's selected block tint is calculated for each act colour in each palette at 4.5:1.
- [ ] **Step 2:** Run both tests; expect FAIL.
- [ ] **Step 3:** In the JSX, read colours from CSS variables (`var(--teal)`, `var(--purple)`, `var(--coral)`, `var(--amber)`, `var(--border)`, `var(--gold)`); `WorkCard` keeps `work.coverColor` (the writer's data) and falls back to `var(--accent)`. In `index.css` replace each tint with `color-mix(in srgb, var(--token) N%, transparent)` at the same strength.
- [ ] **Step 4:** Run `npm --prefix client test`; expect PASS.
- [ ] **Step 5:** Commit `refactor(client): derive tints and chart colours from palette tokens`.

### Task 9: Layout: sidebar, top bar, page frame (→ S3)

**Files:** Modify `client/src/components/layout/{Sidebar,TopBar}.jsx`, `client/src/index.css` (Reset, Layout, Sidebar, TopBar sections).
**Boards:** `Main.dc.html` (shell), `MainRoom.dc.html`. **Apply the Room recipe** with these pins and extras:

- Pins: `.sidebar` background uses `var(--sidebar-bg)` and `var(--glow)`; `.sidebar-brand` has `border-bottom: 3px double var(--gold-dim)` and `font-family: var(--font-display)`; `.sidebar-nav-item.active` has a 2px `var(--gold)` left border; `.topbar` background is `var(--bg-elevated)`. JSX test (`gothicStyles` or a new component test): Sidebar renders an `.ic` icon in each `.sidebar-nav-icon` and a `.rose` next to the brand.
- Add the rose window and the icon masks (`.rose`, `.ic`, `.ic-shelves`, `.ic-room`, `.ic-map`, `.ic-codex`, `.ic-settings`, `.ic-users`, `.ic-out`) to `index.css` from `gothic.css`. The sliding indicator and `Link` behaviour stay.
- Screenshots: Main Room and Shelves in Votive, Nave and Reliquary.

### Task 10: Shared components (→ S5)

**Files:** `client/src/index.css` (Buttons, Form Elements, Cards, Modals, toasts, badges, tabs, Scrollbars, Selection). **Boards:** `Main.dc.html` (Design System), `ModalPattern.dc.html`. **Apply the Room recipe.**

- Pins (from the handoff Components table): `.btn-primary` fills `var(--accent)`, border `var(--gold-dim)`, hover `var(--accent-hover)`; `.btn:disabled, .btn[aria-disabled="true"]` have `border: 1px dashed var(--border-control)`; `.btn-ghost.danger` uses `var(--error)`; `.form-input` fills `var(--bg-input)` with a `var(--border-control)` border and a dashed disabled border; the modal outline is `1px solid var(--gold-dim)` and its header rule `3px double var(--gold-dim)`; the toast has a `3px double` left edge; `.btn-sm` font-size is `var(--type-label)`.
- Native checkbox, radio and range inputs take `accent-color: var(--gold)`; confirm each shows the 2px focus ring in a Playwright sweep.
- Screenshots: the Export modal (modal pattern) and a toast.

### Task 11: Shelves, Work Card, New Work wizard (→ S4)

**Files:** `client/src/components/shelves/{WorkCard,WorkGrid,NewWorkWizard}.jsx`, `client/src/pages/Shelves.jsx`, `index.css` (Shelves, Work Grid, Work Card, Backup Reminder, Wizard). **Boards:** `Shelves.dc.html`, `NewWorkWizard.dc.html`, `PaletteVariants.dc.html`. **Apply the Room recipe.**

- Pins: the work card is a two-column grid with an 18px spine column; the spine takes the work's cover colour and has two `var(--gold-dim)` bands; a completed work renders the wax seal (`.seal`); the wizard's hook choices are `<button aria-pressed>` (existing `wizardHooksFocus.test.js` stays green).
- Screenshots: Shelves in all three palettes, and each wizard step.

### Task 12: Main Room: chapters, editor, toolbar, panel (→ S4)

**Files:** `index.css` (Main Room, Chapter Sidebar, Editor Area, Toolbar, Word Counter, Right Panel, Rekindler Card, Quill Tab, Catch Tab), `client/src/pages/MainRoom.jsx` and the editor and panel components only where a class is needed. **Boards:** `MainRoom.dc.html`, `PaletteVariants.dc.html`. **Apply the Room recipe.**

- Pins: the editor-restraint test (no `gradient`, `mask`, `filter`, `backdrop-filter`, `url(` or `box-shadow` in any rule whose selector contains `.editor-wrap` or is `.editor`, other than `.editor:focus-visible`'s 1px ring); `.panel-tab.active` uses `var(--gold)` with a 2px underline; the scene marker keeps `hr[data-scene]`, its `⁂` glyph and status colours `--gold`, `--text-dim`, `--amber`, `--teal`.
- Screenshots: Main Room in all three palettes.

### Task 13: Map (→ S4)

**Files:** `index.css` (Map View, Chapter Detail), `client/src/components/map/*` for classes only. **Board:** `Map.dc.html`. **Apply the Room recipe.**

- Pins: `mapLayout.test.js` stays green; Map blocks use the act tokens; the chapter detail has the `.corners` frame (small `var(--gold-dim)` corners); lane gaps hatch with `color-mix` of `var(--amber)`.

### Task 14: Codex (→ S4)

**Files:** `index.css` (Codex Tab, Codex View, Codex AI Assist, Codex Entry, Inline Field, Flag List, World Rules). **Board:** `Codex.dc.html`. **Apply the Room recipe.**

- Pins: `.codex-entity-item` active state uses `var(--gold)` with a 2px left bar; section dividers use the display font; `codexInlineFieldsShared.test.js` stays green.

### Task 15: Settings and admin (→ S4, S7)

**Files:** `index.css` (Settings, Admin). **Board:** `Settings.dc.html`. **Apply the Room recipe.**

- Pins: `.pick-card` has a `var(--border-control)` border and, when its radio is checked, a `var(--gold)` border with an inset 1px gold ring (the checked state is read from the native radio, e.g. `:has(input:checked)` or a sibling selector); the palette strip shows each palette's `bg`, `bg-card`, `gold` and `accent`.
- The admin page follows Settings; no mockup exists, so only tokens, fonts and the shared components apply.
- Screenshots: Settings in all three palettes with the selector visible.

### Task 16: Auth pages and Catch overlay (→ S4)

**Files:** `index.css` (Auth pages, Catch Overlay, Hook Generator), `client/src/pages/auth/*` for the lancet and card classes only. **Boards:** `AuthPages.dc.html`, `CatchOverlay.dc.html`. **Apply the Room recipe.**

- Pins: the auth card has a `3px double var(--gold-dim)` top border; the lancet ornament renders above the card; the Catch overlay keeps its non-modal behaviour (`catchOverlay.test.js` stays green).

### Task 17: Modals: Export, Polish review, History compare, Editor review, Chapter summary, Milestones (→ S4, S5)

**Files:** `index.css` (Export Modal, Draft Polish Modal, Chapter History + Milestones, Editor Review Modal, Chapter Summary, Polish Review, Context Used). **Boards:** `ModalPattern.dc.html`, `PolishReview.dc.html`, `HistoryCompare.dc.html`. **Apply the Room recipe.**

- Pins: `.history-item.active` uses `var(--gold)` with a 2px left bar (its `:focus-visible` inset ring stays); Polish review `del` uses `var(--error)` and `ins` uses `var(--success)`; the diff text uses `--font-reading`; format and layout choices use `aria-pressed` with a `var(--gold)` border.

### Task 18: Below 1024px (→ S3, S4)

**Files:** `index.css` (the four `@media (max-width: 640px)` and `(hover: none)` blocks).

- [ ] **Step 1:** Add a pin test: no `@media` block contains a palette-coloured literal or a hard-coded `font-family`.
- [ ] **Step 2:** Run it; if it fails, restyle those rules with tokens and fonts only, keeping their structure.
- [ ] **Step 3:** Re-screenshot every room at 640px; compare with `baseline-640/` from Task 1; no room scrolls sideways that did not before.
- [ ] **Step 4:** Run both suites; commit `style(client): apply tokens to the small-screen rules`.

### Task 19: Verification and hand-off (→ S6; proves A1 to A6)

**Files:** none in the repo (a final notes commit is made in Gate 6).

- [ ] **Step 1 (A1):** Build `<scratchpad>/compare.html`: one row per room with my 1024px and 1440px Votive screenshot beside its board (rendered locally, or a link if Task 1 step 2 failed), plus Main Room and Shelves in Nave and Reliquary. Hand it to the dev for the side-by-side review.
- [ ] **Step 2 (A2):** `npm --prefix client test` passes (contrast for all three palettes, focus styles). Run a Playwright sweep over every page at 1024px: tab through each interactive element and record any without a visible 2px ring, including the real checkbox, radio and hook controls. Fix and repeat until none remain.
- [ ] **Step 3 (A3):** `cd client && npm run build`; `grep -rE "https?://[^\"' ]*font" dist` finds no font host; load the app in Playwright with `browser_network_requests` and confirm no request to a third-party font host.
- [ ] **Step 4 (A4):** `npm --prefix client test` and `npm --prefix server test` pass. List every test file the branch changed and why; check each change is for the palette selector, the editor font, or a CSS-pinning selector.
- [ ] **Step 5 (A5):** Repeat Task 1 step 3 on the finished branch; the median and p95 are within the noise of `baseline-typing.json` (re-run the baseline once on `main` if the noise is unclear). Write both numbers on the card.
- [ ] **Step 6 (A6):** Server test from Task 2 passes. In Playwright with the dev stack: choose Nave in Settings, check the attribute and cache, clear `localStorage`, reload, and see Nave come back from the account; then choose Votive and confirm the same.
- [ ] **Step 7:** Compare 640px screenshots with the baseline (Task 18). Post the evidence on the card and ask the dev to review `compare.html`.

---

## Coverage

| Subtask | Tasks |
|---|---|
| S1 tokens and contrast pairs | 5, 8 |
| S2 fonts | 6 |
| S3 layout | 9, 18 |
| S4 rooms | 11 to 18 |
| S5 shared components | 8, 10, 17 |
| S6 visual check | 1, 19 (and R5 in every room task) |
| S7 palette selector | 2, 3, 4, 15 |
| S8 editor font | 7 |

| Criterion | Proof |
|---|---|
| A1 rooms match | Task 19 step 1, `compare.html`, and the dev's review (the dev ticks it) |
| A2 contrast and focus | `contrast.test.js` per palette (Task 5, 8); focus sweep (Task 19 step 2) |
| A3 fonts self-hosted | `fonts.test.js` (Task 6); build grep and network log (Task 19 step 3) |
| A4 suites unchanged | Both suites green on every commit; changed-test list (Task 19 step 4) |
| A5 typing speed | Baseline (Task 1) against final (Task 19 step 5) |
| A6 palette persists | `settingsPalette.routes.test.js` (Task 2), `settingsPalette.test.js` (Task 4), Playwright run (Task 19 step 6) |

Nothing is proposed for descope.
