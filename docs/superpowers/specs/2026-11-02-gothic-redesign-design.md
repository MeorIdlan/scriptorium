# Apply the gothic redesign to the classic UI: design

Card: [uqVctsf5](https://trello.com/c/uqVctsf5). PRD: FR-45, NFR-3, NFR-6.
Depends on the design card [M1e2Naqh](https://trello.com/c/M1e2Naqh), whose handoff is `docs/design/gothic-design-system.md` (merged in PR #39).

## Intent

The classic UI is a plain dark theme. The dev wants a grimdark cathedral look: stone, gold and candlelight around a quiet writing page. The look is designed and approved. This work builds it into the real app, without changing what the app does.

Two small behaviour changes were approved with the design: writers can pick one of three palettes in Settings, and the editor's default font becomes EB Garamond at size 19.

## Sources and which wins

1. `docs/design/gothic-design-system.md`: tokens, type, component states, build notes. Wins on any question of behaviour and wording.
2. The screens artifact, <https://claude.ai/artifact/E8oEsNutMUyWobkDTBJf1x>: one board per screen, plus the exact CSS in `project/gothic.css`, `screens.css`, `overlays.css`, `additions.css`. Wins on any question of how a screen looks.
3. The design-system artifact, <https://claude.ai/artifact/4GUYF6V7p5FKUaQyechXoZ>: tokens and component notes, a copy of what is in (1) and the handoff.

The artifact CSS uses its own class names (`.btn`, `.tome`, `.nav-item`), which are not the app's (`.sidebar-nav-item`, `.chapter-item`, `.work-card`). The build maps the design onto the app's existing classes. It does not rename the app's classes to match the mockups. Several tests pin the existing selectors.

The standalone Claude Design project closes on 2026-12-14. The artifacts are the copy to build from. The mockups' sample story text and values are invented and must not be copied into the app.

The builder reads the artifacts with the `Artifact` tool's `read` action (`path` for one file, `paths` for several), which saves them into the session's scratchpad. The four CSS files are about 35 KB in all. They are not committed to the repo: the artifacts are private pages owned by the dev and do not depend on Claude Design. The first plan task reads the four CSS files and the boards it needs, so later tasks work from local copies.

## Goals

- Every room matches its approved screen at 1024 px and wider, in Votive. Main Room and Shelves also match in Nave and Reliquary. The rooms are Shelves, Main Room, Map, Codex, Settings, the Catch overlay, the auth pages, and the modals (Export, Polish review, History compare, New Work wizard). The admin page follows Settings. Other modals follow the modal pattern.
- Three palettes (Votive default, Nave, Reliquary) that every colour in the app responds to.
- A writer chooses a palette in Settings and it follows their account across devices.
- Fonts are served by the app itself.
- The writing area stays plain and fast.

## Non-goals

- No change to routes, API shapes, copy or behaviour, apart from the palette selector and the editor font default. Where a mockup shows different wording, the app's wording stays.
- No layout below 1024 px. Responsive layout is a separate MVP 2 story. Do not make it worse than it is now.
- No new controls beyond the palette selector.
- No Games Workshop names, logos or iconography in names, copy, ornaments or icons.
- No renaming of the app's CSS classes to match the mockups.

## Anti-goals (what would make this a failure even if it looks right)

- Nave or Reliquary shipping with Votive's warm gold tints in some corner, because a colour was hard-coded.
- A slower editor on a long work: textures, gradients, masks, filters or shadows inside the writing area.
- A flash of the wrong palette on a normal page load, where the browser's cached palette matches the account's.
- A palette that looks saved but is lost, because the server dropped the field.
- A request to Google Fonts or any other font host at runtime.
- A focus ring missing on any control, including the drawn-looking ones: checkbox, radio, hook buttons.

## What the dev decided

- Three palettes, Votive default, Nave and Reliquary selectable in Settings, saved to the account and cached in the browser.
- Fonts come from Fontsource npm packages (`@fontsource/pirata-one`, `@fontsource/eb-garamond`, `@fontsource/spectral`), so Vite bundles the woff2 files. Not committed binaries, not variable fonts.
- One branch and one PR, with commits by stage: foundations first (tokens, fonts, palette selector, editor font), then layout, shared components, and one commit per room.
- Visual check: Playwright screenshots of each room at 1024 px and 1440 px in Votive, and Main Room and Shelves in Nave and Reliquary, each placed next to its artifact board on one comparison page. The dev reviews that page for A1.
- EB Garamond 19 is the new default editor font. The other fonts (Georgia, Arial, Verdana, Courier) stay available. Existing formatted text stays as it is.
- Pirata One for titles, EB Garamond for writing text, Spectral for the interface.

## Design

### 1. Tokens and palettes (S1)

`client/src/index.css` keeps its single token block, split by palette: `:root, [data-palette="votive"]` for Votive, then `[data-palette="nave"]` and `[data-palette="reliquary"]`. Token names and values are exactly the handoff's table. New tokens: `--accent`, `--accent-hover`, `--glass-1`, `--glass-2`, `--glow`. Add the type and font tokens (`--font-display`, `--font-reading`, `--font-ui`, `--type-*`) and the new radii (2 px, 1 px, 3 px) in the non-palette `:root` block.

The `data-palette` attribute lives on `<html>`.

`client/test/contrast.test.js` is rewritten to parse every palette block. It must fail if a palette block is missing, run all its existing checks for each palette, and add: `--text` on `--accent` and `--accent-hover`, and `--gold-hover` as text, on every background. Today it reads only the first `:root` block, so a plain `:root` would keep it green with two palettes unchecked.

### 2. Hard-coded colours and fonts (S1, S5)

Tokens alone do not re-theme the app. Measured on this branch: `index.css` has 77 lines with `rgba()` literals (old gold, purple and amber tints, plus `#e8a030`) and 40 `font-family` lines that bypass any token. `TensionCurve.jsx`, `ChapterBlocks.jsx` (`ACT_COLORS` and the missing-beat dot) and `WorkCard.jsx` hard-code colours too.

- Every palette-coloured tint is derived from a token, with `color-mix(in srgb, var(--token) N%, transparent)` (the design's own `additions.css` does the same). Fixed black scrims and shadows may stay `rgba(0, 0, 0, …)`.
- Every `font-family` goes through `--font-display`, `--font-reading` or `--font-ui`. The one exception is the editor's own font choices, which are the writer's content.
- Act colours map to `--teal`, `--purple` and `--coral`. The JSX components read them from CSS variables, not from hex strings.
- The contrast test's "no hard-coded text colours" checks keep passing, and it is extended where the move to `color-mix` changes what it can read: the rule-category badge test and the selected-chapter-block test must resolve their tints per palette. The handoff notes that the selected Map block's tint was never calculated, so it must be calculated here, for each act colour in each palette.

### 3. Fonts (S2, A3)

The three Fontsource packages are added as client dependencies. Only the Latin subsets and the weights the design uses are imported (Pirata One 400; EB Garamond 400, 400 italic, 700, 700 italic, because the editor has bold and italic; Spectral 400, 500, and italic and bold only if a screen uses them). The imports happen once, from `main.jsx` or `index.css`. Each face keeps its licence file in `node_modules`, and the card's PR notes the licence (SIL Open Font Licence, all three).

A3 is proven by a built-output check: no `fonts.googleapis.com`, `fonts.gstatic.com` or any other `https://` font URL in `dist` or `index.html`, and no such request when the app loads in Playwright.

### 4. Restyle (S3, S4, S5)

Order of work, one commit each: layout (top bar, sidebar, panels), shared components (buttons, inputs, selects, checkboxes and radios, tabs, badges, toasts, modals), then the rooms: Shelves, Main Room (editor surround, chapter list, Quill panel), Map, Codex, Settings and admin, auth pages, Catch overlay, then the modals one by one.

Ornaments follow the handoff: rose window, lancet, wax seal, quatrefoil divider, double rule, corner frame, tome spine, geometric icons drawn as CSS masks. All are outside the editor. The quatrefoil divider never appears in the writing area because it relies on CSS masks.

Rules that carry over from the existing code and must not be lost:

- Real controls stay real. Checkboxes and radios are native inputs restyled with `accent-color` and borders. Some mockups draw them as spans, which is only a drawing. Wizard hooks stay toggle buttons with `aria-pressed`.
- Focus: the global `:focus-visible` ring (2 px `--border-focus`, offset 2 px), the inset ring for edge items, and the editor's 1 px box-shadow exception stay exactly as `focusStyles.test.js` pins them.
- Busy buttons keep `aria-disabled` so they hold focus, and take the disabled look.
- The scene marker keeps `hr[data-scene]`, its status-coloured `⁂` glyph and its title. No quatrefoil or mask.
- Inline `.form-error` text stays inline in `--error`.

`mapLayout.test.js` and `focusStyles.test.js` stay green unchanged unless a rule moves, in which case only the test's selector list is updated, never its intent.

Below 1024 px: the existing media-query rules (for example the 640 px ones) are restyled with the new tokens and fonts and keep their structure. No layout is added or removed. The check for "not worse" is a Playwright screenshot of each room at 640 px before and after, plus a check that no room scrolls sideways at 640 px if it did not before.

A source-scan test fails on leftover palette-coloured literals: in `index.css` outside the palette blocks, and in `.jsx` files, any `rgba()` or hex colour that is not black or white (scrims and shadows) and not a token. It covers every room in every palette, including the ones that have no Nave or Reliquary screenshot.

### 5. Palette selector (S7, A6)

**Server.**
- `Settings` gets `palette: { type: String }` with no default, so unset means "never chosen".
- `GET /api/settings` returns `palette`, `'votive'` when unset.
- `PUT /api/settings` validates `palette` against `votive`, `nave`, `reliquary`, and returns 400 `VALIDATION_ERROR` otherwise. This matters because the schema's strict mode would otherwise drop the field and `saveSettings` would still return a merged object that looks saved.
- Covered by an HTTP test with the in-memory MongoDB: a round trip, an invalid value, and that saving other settings does not clear it.

**Client.**
- A small `palette` util owns the list of names, reading and writing the cache (`localStorage`, wrapped in try/catch), and setting `document.documentElement.dataset.palette`. An unknown or missing cached value means Votive.
- An inline script in `index.html`, before the module bundle, applies the cached palette so the first paint is right. It repeats the three names. A test reads `index.html` and the util and fails if the lists differ.
- After sign-in the app applies the account's palette and refreshes the cache. It reuses the existing settings read if that is clean, rather than adding a second request. A palette on the account wins over the cache. Before sign-in, the cached palette or Votive. When the cache and the account disagree (a new device, or the palette changed elsewhere), the page paints the cached palette and switches once the settings load. Signed-in rendering does not wait for the settings read.
- Settings gets an "Appearance" section at the top, in the `.pick-card` look from `Settings.dc.html`. It uses native radios in a `radiogroup`, so arrow keys work. Choosing a card applies the palette at once and saves with `PUT /settings { palette }` on its own, as `handleToggleAi` does, because `handleSave` sends only named keys. If the save fails it shows an error and puts the previous palette back.

### 6. Editor font (S8)

In `Toolbar.jsx`, add `EB Garamond` to `FONTS` and 19 to `SIZES`, and make them the selects' defaults. `.editor` changes from Georgia, 1rem, line height 1.85 to `--font-reading`, 1.1875rem (19 px), line height 1.7. The other fonts stay in the list. Existing chapter HTML is not rewritten.

The size select maps to `document.execCommand('fontSize', …)`, which takes 1 to 7, not pixels (the existing map is already approximate). With 19 as the default, choosing "19" on a selection must leave that text at the editor's default size. What exact command achieves that is for the plan to settle, with a test in `toolbar.test.js`. Existing sizes keep their current mapping. This is the one place where the app's behaviour is not obviously preserved, so the plan should say what it chose.

`htmlService.js` already allows `<font face size>` and `font-size` in styles, so the server side needs no change for the font. The export (DOCX, PDF, EPUB) reads text runs and is unaffected.

### 7. Editor speed (A5)

Inside `.editor-wrap` and `.editor` there are no gradients, masks, filters, `backdrop-filter`, background images or box shadows other than the existing 1 px focus ring. The design's `--glow` and the sidebar's repeating gradient apply to the sidebar only. A test pins the editor rules against these properties.

Proof: a 150,000-word work is seeded, and typing latency in the editor is measured in Playwright before and after, on the same machine, with the same method. "As responsive as before" means within the noise of that measurement. Both numbers are written to the card.

## Verification, by criterion

| Criterion | Proof |
|---|---|
| A1, rooms match at 1024 px and wider | Playwright screenshots next to artifact boards on one page, then the dev's side-by-side review. The dev ticks it. |
| A2, contrast and focus | `contrast.test.js` passes for all three palettes; `focusStyles.test.js` passes; a Playwright sweep reports each interactive element's focus ring at 1024 px, including the real checkbox, radio and hook controls. |
| A3, fonts self-hosted | The built-output check and a Playwright network log with no third-party font request. |
| A4, no behaviour change | `npm test` for the client and the server, unchanged apart from the tests that must change for the palette selector, the editor font and the CSS-pinning tests. The PR lists every changed test and why. |
| A5, typing speed | The before and after measurement above. |
| A6, palette persists | The server HTTP test, a client test for the selector, and a Playwright run: choose Nave, reload, sign in from a fresh browser context, and see Nave. |

### Tooling for the checks

The Playwright checks (A1 screenshots, the A2 focus sweep, the A3 network log, the A5 typing measurement, the A6 run) run in the session through the Playwright browser tools, with scripts kept in the scratchpad. Playwright is not added to the repo, and CI does not change. The repo's own proof is the `node --test` suites, including the new tests above.

**A1 comparison page.** It is a throwaway HTML page in the scratchpad, not committed. Each row holds my screenshot of a room beside the matching artifact board. The boards are private pages, so the builder first tries to render them locally from the saved `.dc.html` files and the design runtime. If that does not work, the board column links to the artifact and the dev compares against it open in their own browser. Either way the dev's side-by-side review is what ticks A1.

**A6.** The dev auth bypass makes every request the same admin user, so a second user can't be tested locally. "Another device" is a browser context with an empty cache. The run sets Nave in Settings, clears `localStorage`, reloads, and expects Nave. That proves the account value is read and applied, not just the cache. The server HTTP test proves the value is stored per user. The real login flow is not driven headlessly (it needs an emailed code and a passkey).

## Constraints and risks

- `index.css` is 3,724 lines. The diff will be large, so commits are staged and each commit leaves the suites green.
- Tests that read CSS or JSX source: `contrast.test.js`, `focusStyles.test.js`, `mapLayout.test.js`, and `formLabels.test.js`, which scans every `.jsx`. They are updated, not weakened.
- The Claude Design project closes on 2026-12-14. Anything from it that is not in the artifacts or the handoff is gone after that.

## Left to the builder

- The exact Fontsource weights and import form.
- How the JSX components read palette colours from CSS variables.
- Whether the palette reuses the settings read in `AiContext` or gets its own context.
- File layout for the new util and its tests.
- The order of the room commits after layout and components.

## Calls I made (the dev has not decided these)

- Tints derive from tokens with `color-mix`, and the contrast test is extended to resolve them per palette. The alternative, a set of `rgba` constants per palette, doubles the CSS and is easier to get wrong.
- The cache key and the `palette` field name. Nothing visible depends on them.
- The palette applies at once and is reverted on a failed save, rather than waiting for the save. This follows the handoff ("applying straight away", "keep the previous palette if the save fails").
- No change to the admin page beyond following Settings, since it has no mockup.
- Old chapters that carry no explicit font or size will show in EB Garamond 19 instead of Georgia 16 once this ships, because the default changed. No per-chapter or per-work fallback is built. Text with explicit formatting stays as it is.
- The Playwright checks stay out of the repo (see Tooling for the checks).
- The source-scan test for leftover colours is in addition to the token-driven contrast test.
- Styling below 1024 px is tokens and fonts only, with the structure unchanged.
- The editor-speed measurement is "before and after on this machine", because the card gives no number to meet.
