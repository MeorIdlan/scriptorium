# Main Room on phones and tablets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Main Room usable on phones and tablets: the app nav, chapter list and right panel become drawers or a bottom sheet, the toolbar scrolls and has touch-size targets, the on-screen keyboard never hides the caret, and unsaved text is flushed when the page is hidden.

**Architecture:** A `layoutMode` module (`phone` / `tablet` / `desktop`) and a `useLayoutMode()` hook decide, in JS, whether each side area is inline or a drawer. In drawer mode the *same* element gets drawer classes and attributes (always mounted, moved off-screen and `inert` when closed), so state survives and the desktop DOM is untouched. Open state is one `drawer` field in `UIContext`. Mode-dependent styling lives in CSS media queries that use the same numbers. A visual-viewport hook drives the layout height and keeps the caret in view.

**Tech Stack:** React 18 + Vite 5, plain CSS in `client/src/index.css`, `node --test` with `linkedom` (no layout engine), Playwright (MCP tool) for real layout.

**Spec:** `docs/superpowers/specs/2026-11-02-main-room-responsive-design.md` (read it first; it holds decisions D1–D5 and the eight calls)

## Global Constraints

- Modes: desktop = 1100px and up (unchanged); tablet = 641 to 1099px; phone = 640px and down. `PHONE_MAX = 640`, `TABLET_MAX = 1099`.
- Phone: nav and chapter list are left drawers, panel is a bottom sheet (at most 70% of the visual viewport height). Tablet: nav is a left drawer, chapter list inline, panel is a right drawer.
- Left drawers `min(280px, 85vw)` wide; tablet right drawer `min(360px, 90vw)`.
- Touch targets in tablet and phone modes: at least 44px. Toolbar there: `flex-wrap: nowrap; overflow-x: auto`, the page never scrolls sideways.
- Editor padding: `28px 24px` tablet, `20px 16px` phone (desktop keeps `40px 32px`).
- Desktop mode must render **exactly** the DOM it renders today: no new elements, classes or attributes (A4).
- Drawer content stays mounted when closed. No swipe or drag gestures.
- Autosave flush on `visibilitychange` (hidden) and `pagehide`; `keepalive` only while the request body is under 60,000 bytes.
- Modals (History, Summary, Milestones, Polish, Export) keep their current layout; drawers sit below them (drawer z-index 90, backdrop 80; `.modal-backdrop` is 100).
- Client is ESM; tests: `cd client && npm test` (also run `cd server && npm test` at the end; CI runs both). No linter. Existing tests (contrast, focus, `contentRegion`) must stay green.
- Work only in `/home/meor/workspace/scriptorium-cjO2HTdL` on `feat/cjO2HTdL-main-room-responsive`. Run `cd client && npm ci` once before Task 1.
- Commits: Conventional Commits, ≤72 chars, imperative. Body ends with `Trello: https://trello.com/c/cjO2HTdL` then a `Co-Authored-By:` line naming the model that wrote the code and the `Claude-Session:` line from the session's attribution instructions.
- Never commit `client/vite.check.config.js`, `.playwright-mcp/` or screenshots.

## Review Focus

- Window resized or rotated while a drawer is open (phone → tablet → desktop): the drawer closes, no backdrop or `inert` is left behind. *(Task 3)*
- A closed-then-reopened panel is the same DOM node with its tab and typed text intact, not re-created. *(Task 5)*
- A modal opened from inside a drawer (Milestones from the chapters drawer): Esc closes the modal only, and the drawer is still open behind it. *(Task 4)*
- Autosave flush: no PUT when nothing is pending, no second PUT when `visibilitychange` and `pagehide` both fire, no `keepalive` on a body over 60,000 bytes. *(Task 9)*
- `window.matchMedia` missing (old browser, linkedom): behaves as desktop, no crash. *(Task 1)*

## Browser-check stack (for Playwright steps; not committed)

Run once per session, in the background, all under the scratchpad:
1. `~/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6 --dbpath $SCRATCH/db --port 27018 --bind_ip 127.0.0.1`
2. `cd server && npm ci && MONGODB_URI=mongodb://127.0.0.1:27018/scriptorium PORT=3011 DEV_AUTH_BYPASS=true node src/server.js`
3. `client/vite.check.config.js` (untracked): the normal config with the proxy target `http://localhost:3011`; start `cd client && npx vite --config vite.check.config.js --port 5199 --host 127.0.0.1`.
4. Seed one work with 3 chapters (long enough to scroll) through the API, with a few sentences in each. Set the palette with `PUT /api/settings`, never by hand.
5. The "main" comparison server (Task 10) is the same recipe run from `/home/meor/workspace/scriptorium` (same commit as the branch's base) on port 5198, against the same server.

Playwright notes: resize with `browser_resize`; the files it writes land under the worktree's `.playwright-mcp/`; move or delete them before any commit. A simulated keyboard is `browser_resize` to a shorter height (844 → 480), which shrinks the visual viewport the way a keyboard does. Overflow probe used throughout (`browser_evaluate`):
```js
() => ({
  innerWidth, scrollWidth: document.documentElement.scrollWidth,
  overflowing: ['.layout','.main-area','.content','.main-room','.main-room-body','.editor-area','.editor-wrap']
    .filter(s => { const e = document.querySelector(s); return e && e.scrollWidth > e.clientWidth + 1; })
})
```
Pass = `scrollWidth <= innerWidth` and `overflowing` empty.

---

## File Structure

- `client/src/utils/layoutMode.js` (create): constants and `modeForWidth`.
- `client/src/hooks/useLayoutMode.js` (create): the hook.
- `client/src/hooks/useDrawer.js` (create): drawer behaviour for an always-mounted element.
- `client/src/components/layout/DrawerBackdrop.jsx`, `DrawerClose.jsx` (create): shared chrome.
- `client/src/utils/mainRoomPath.js` (create): `isMainRoomPath`.
- `client/src/hooks/useVisualViewport.js`, `client/src/utils/caretVisible.js` (create): keyboard handling.
- `client/src/context/UIContext.jsx` (modify): `drawer` state, export `uiReducer`.
- `client/src/App.jsx`, `components/layout/Sidebar.jsx`, `TopBar.jsx`, `pages/MainRoom.jsx`, `components/panel/RightPanel.jsx`, `components/editor/WordCounter.jsx`, `Toolbar.jsx`, `hooks/useAutosave.js`, `utils/api.js` (modify).
- `client/src/index.css` (modify): drawer base, compact-mode rules, `.page-enter` fix.
- `client/test/support/viewport.js` (create); `client/test/support/app.js` (modify: record `keepalive`).
- Tests (create): `layoutMode.test.js`, `uiDrawer.test.js`, `navDrawer.test.js`, `chapterDrawer.test.js`, `panelDrawer.test.js`, `toolbarTouch.test.js`, `visualViewport.test.js`, `caretVisible.test.js`, `autosaveHidden.test.js`.

---

### Task 1: Layout modes (→ S1)

**Files:**
- Create: `client/src/utils/layoutMode.js`, `client/src/hooks/useLayoutMode.js`, `client/test/support/viewport.js`, `client/test/layoutMode.test.js`

**Interfaces:**
- Produces: `PHONE_MAX = 640`, `TABLET_MAX = 1099`, `modeForWidth(width: number): 'phone'|'tablet'|'desktop'`, `LAYOUT_QUERIES = { phone: '(max-width: 640px)', tablet: '(min-width: 641px) and (max-width: 1099px)' }`; `useLayoutMode(): 'phone'|'tablet'|'desktop'` (desktop when `window.matchMedia` is missing).
- Produces (test support): `setViewport(width: number): void` installs a `window.matchMedia` stub that understands only `min-width`/`max-width` and notifies listeners already attached; `resetViewport(): void` removes it.

- [ ] **Step 1: Write the failing tests** in `layoutMode.test.js`: `modeForWidth` gives `phone` at 640, `tablet` at 641 and 1099, `desktop` at 1100; `index.css` guard: every number in an `@media (…width: Npx)` query is one of 640, 641, 1099, 1100 (`'media queries use the layout-mode numbers'`); a probe component using `useLayoutMode()` renders `phone` after `setViewport(390)`, `tablet` after `act(() => setViewport(800))`, `desktop` after `setViewport(1280)`, and `desktop` with no `matchMedia`.
- [ ] **Step 2: Run** `cd client && npm test -- test/layoutMode.test.js` → FAIL (modules missing).
- [ ] **Step 3: Implement** the module, the hook (`useSyncExternalStore` over the two `matchMedia` lists) and `viewport.js`.
- [ ] **Step 4: Run** the file → PASS; then `npm test` → whole suite green.
- [ ] **Step 5: Commit** `feat(client): add phone, tablet and desktop layout modes`.

### Task 2: Drawer state, `useDrawer` and shared drawer styles (→ S2)

**Files:**
- Create: `client/src/hooks/useDrawer.js`, `client/src/components/layout/DrawerBackdrop.jsx`, `DrawerClose.jsx`, `client/test/uiDrawer.test.js`
- Modify: `client/src/context/UIContext.jsx`, `client/src/index.css`

**Interfaces:**
- Consumes: `useUI()` from `UIContext`.
- Produces: `UIContext` state `drawer: null | 'nav' | 'chapters' | 'panel'`; actions `{ type: 'OPEN_DRAWER', name }` (replaces any open drawer) and `{ type: 'CLOSE_DRAWER' }`; `uiReducer` exported.
- Produces: `drawerId(name: string): string` → `'drawer-' + name`.
- Produces: `useDrawer(name: 'nav'|'chapters'|'panel', placement: 'left'|'right'|'bottom'|null, label: string): { isDrawer: boolean, isOpen: boolean, open(): void, close(): void, className: string, attrs: object }`. With `placement === null` it returns `className: ''`, `attrs: {}` and `isDrawer: false`, so callers spread it without changing the desktop DOM. Otherwise `className` is `' drawer drawer--<placement>'` plus `' is-open'` when open (leading space, callers append it), and `attrs` is `{ ref, id: drawerId(name), role: 'dialog', 'aria-label': label, 'aria-modal': 'true' only when open, tabIndex: -1, inert: '' when closed else undefined, onKeyDown }`. (`inert` is passed as the string `''` because React 18 drops a boolean `inert`.)
- Produces: `<DrawerBackdrop />` (renders `div.drawer-backdrop` only while `state.drawer` is set; click closes) and `<DrawerClose label onClose />` (a `button.drawer-close`, `aria-label="Close <label>"`).

- [ ] **Step 1: Write the failing tests** in `uiDrawer.test.js`: reducer: `OPEN_DRAWER nav` → `'nav'`, then `OPEN_DRAWER panel` → `'panel'`, `CLOSE_DRAWER` → `null`. A host rendering `<aside {...attrs}>` with a button inside and an outside opener button: with `placement: null` the aside has class `''`, no `inert`, no `role`; closed with `'left'` → classes `drawer drawer--left`, `inert` attribute present; after `open()` → `is-open` added, `inert` gone, focus on the first focusable inside; Esc closes it and focus returns to the opener; Tab on the last focusable wraps to the first, Shift+Tab on the first to the last; clicking `DrawerBackdrop` closes. CSS guard (`'page-enter leaves no transform behind'`): the `.page-enter` rule's `animation` does not contain `both` or `forwards`.
- [ ] **Step 2: Run** `npm test -- test/uiDrawer.test.js` → FAIL.
- [ ] **Step 3: Implement** the reducer cases, `useDrawer` (modelled on `hooks/useModal.js` for the Esc, Tab trap and opener bookkeeping, but driven by `isOpen` changing rather than mount; do not change `useModal`), the two components, and the CSS: `.drawer` (`position: fixed; z-index: 90; visibility: hidden; transform` off-screen per placement; transition on `transform` ~0.22s with `visibility` delayed on close, none under `prefers-reduced-motion: reduce`), `.drawer.is-open` (`visibility: visible; transform: none`), placements `--left` (`top:0; bottom:0; left:0; width:min(280px,85vw); min-width:0`), `--right` (same on the right, `width:min(360px,90vw)`), `--bottom` (`left:0; right:0; bottom:0; width:100%; max-height: 70%` of `var(--app-height, 100dvh)`), `.drawer-backdrop` (`position: fixed; inset: 0; z-index: 80; background` as `.modal-backdrop`; `touch-action: none; overscroll-behavior: contain`), `.drawer-close` (44px square, top-right of its header). Drawers use the panel/sidebar background tokens already on those elements. Change `.page-enter` to `animation: pageEnter 0.2s ease-out backwards;` with a comment that a kept transform would make fixed drawers inside it position against the page, not the screen.
- [ ] **Step 4: Run** the file and the whole suite → PASS.
- [ ] **Step 5: Commit** `feat(client): add shared drawer state and behaviour`.

### Task 3: App nav drawer and top-bar menu button (→ S2)

**Files:**
- Modify: `client/src/App.jsx` (Layout), `components/layout/Sidebar.jsx`, `components/layout/TopBar.jsx`, `client/src/index.css`
- Test: `client/test/navDrawer.test.js`

**Interfaces:**
- Consumes: `useLayoutMode`, `useDrawer`, `drawerId`, `DrawerBackdrop`, `DrawerClose`, `setViewport` from Tasks 1–2.
- Produces: in `Layout`, `<DrawerBackdrop />` after `.main-area`, and an effect that dispatches `CLOSE_DRAWER` whenever `location.key` or the layout mode changes. `TopBar` renders `button.topbar-menu` (`aria-label="Open menu"`, `aria-expanded`, `aria-controls={drawerId('nav')}`) first in both of its returns when the mode is not desktop.

- [ ] **Step 1: Write the failing tests** in `navDrawer.test.js` (render `App` with `renderApp`, as `contentRegion.test.js` does): at 390px the menu button exists and `nav.sidebar` carries `drawer drawer--left` and `inert`; clicking the menu opens it (`is-open`, `aria-expanded="true"`, backdrop present); Esc, the backdrop, the close button, and following a nav link each close it. `(Review Focus)` With the nav open, `act(() => setViewport(1280))` closes it: no backdrop, no `inert`, no drawer class. At 1280px: no `.topbar-menu`, no `.drawer-backdrop`, and the `nav` element's `className` is exactly `sidebar` with no `inert`, `role` or `id` attribute (A4).
- [ ] **Step 2: Run** the file → FAIL.
- [ ] **Step 3: Implement**: `Sidebar` calls `useDrawer('nav', mode === 'desktop' ? null : 'left', 'Rooms menu')` and spreads `className`/`attrs` on its `<nav>` (keeping `aria-label="Rooms"` only when not a drawer); it renders `DrawerClose` first when `isDrawer`. Add the menu button, the layout effect and backdrop. CSS: `.topbar-menu` (44px, hidden by default, shown by the JS condition, not a media query); `.sidebar.drawer` keeps its background and keeps the active-indicator absolutely positioned inside it.
- [ ] **Step 4: Run** the file and the whole suite → PASS. Then Playwright at 390x844 and 768x1024 (Browser-check stack): menu opens and closes the nav by button, backdrop and Esc; the nav is above the top bar and below a modal (open Milestones on the Main Room at 768 to compare); the sliding indicator sits on the active item; at 1280x800 the Main Room looks as on `main`.
- [ ] **Step 5: Commit** `feat(client): open the app nav as a drawer on small screens`.

### Task 4: Chapters drawer on phones (→ S2)

**Files:**
- Create: `client/src/utils/mainRoomPath.js`, `client/test/chapterDrawer.test.js`
- Modify: `client/src/pages/MainRoom.jsx`, `components/layout/TopBar.jsx`, `client/src/index.css`

**Interfaces:**
- Produces: `isMainRoomPath(pathname: string): boolean` — true for `/work/<id>` and `/work/<id>/chapter/<id>` (optional trailing slash), false for `/work/<id>/map`, `/work/<id>/codex` and everything else.
- Consumes: `useDrawer('chapters', mode === 'phone' ? 'left' : null, 'Chapters')`.
- Produces: in `TopBar`, when mode is `phone` and `isMainRoomPath(location.pathname)` and a chapter is open, `.topbar-chapter-pill` is a `<button>` (`aria-expanded`, `aria-controls={drawerId('chapters')}`) that opens the chapters drawer; otherwise it is the same `<span>` as today.

- [ ] **Step 1: Write the failing tests** in `chapterDrawer.test.js`: `isMainRoomPath` table; at 390px on `/work/w1/chapter/c1` the chapter pill is a button, the `aside.chapter-sidebar` is a closed drawer, clicking the pill opens it; picking another chapter closes it and navigates; picking the *already open* chapter also closes it; on `/work/w1/map` the pill is still a span; at 800px (tablet) and 1280px the aside has class exactly `chapter-sidebar` and the pill is a span (A4). `(Review Focus)` open the chapters drawer, click Milestones (◆): the modal opens; Esc closes only the modal and the drawer is still open.
- [ ] **Step 2: Run** the file → FAIL.
- [ ] **Step 3: Implement** `isMainRoomPath`; in `MainRoom` spread `className`/`attrs` on the `aside`, add `DrawerClose` in its header when `isDrawer`, and call `drawer.close()` in `handleChapterSelect` (including the same-chapter early return). In `TopBar` switch the pill element as above. CSS for the pill button reset (no border or background, inherits the pill look) and the drawer header layout.
- [ ] **Step 4: Run** the file and the whole suite → PASS. Playwright at 390x844: pill opens the chapter list, picking a chapter loads it and closes the drawer, add-chapter form works inside it.
- [ ] **Step 5: Commit** `feat(client): open the chapter list as a drawer on phones`.

### Task 5: Right panel as tablet drawer and phone sheet (→ S2)

**Files:**
- Modify: `client/src/components/panel/RightPanel.jsx`, `components/editor/WordCounter.jsx`, `components/editor/Toolbar.jsx` (Spark only), `client/src/index.css`
- Test: `client/test/panelDrawer.test.js`

**Interfaces:**
- Consumes: `useDrawer('panel', mode === 'tablet' ? 'right' : mode === 'phone' ? 'bottom' : null, 'Panel')`, called before `RightPanel`'s early return; both of its returns get the `className`/`attrs`.
- Produces: `WordCounter` renders `button.word-counter-panel` (text "Panel", `aria-expanded`, `aria-controls={drawerId('panel')}`) when the mode is not desktop. The Spark button, in non-desktop modes, also dispatches `{ type: 'OPEN_DRAWER', name: 'panel' }`.

- [ ] **Step 1: Write the failing tests** in `panelDrawer.test.js` (AI on): at 800px the panel is `drawer drawer--right`, at 390px `drawer drawer--bottom`, both closed with `inert`; the Panel button opens it; the close button, Esc and the backdrop close it. At 1280px: panel class exactly `right-panel`, no Panel button (A4). All four tabs (Quill, Scenes, Codex, Catch) are reachable inside the open panel. `(Review Focus)` open the panel, switch to Scenes, close, reopen: the `.right-panel` node is the same object as before and Scenes is still the active tab. Spark at 390px with the Scenes tab showing: the panel is open, the tab is Quill, and the hook generator is open.
- [ ] **Step 2: Run** the file → FAIL.
- [ ] **Step 3: Implement** as above. CSS: panel inner content scrolls (`.panel-body` keeps its overflow); sheet header holds `DrawerClose`; tab indicator rules untouched; in non-desktop modes only, `.right-panel input, textarea, select` and `.chapter-add-input` use `font-size: 16px` so iOS doesn't zoom the page on focus. Keep these as `@media (max-width: 1099px)` rules.
- [ ] **Step 4: Run** the file and the whole suite → PASS. Playwright at 390x844 and 768x1024: panel opens from the Panel button, each tab renders, close works three ways; the sheet is under the open Milestones modal.
- [ ] **Step 5: Commit** `feat(client): open the right panel as a drawer or sheet on small screens`.

### Task 6: Compact editor surface (→ S1, S2)

**Files:**
- Modify: `client/src/index.css`
- Test: `client/test/layoutMode.test.js` (extend the CSS guard)

- [ ] **Step 1: Write the failing check.** Playwright at 390x844, 768x1024, 1024x768 on the seeded chapter with the overflow probe, plus: `.editor-wrap` computed padding, `.topbar` content within the viewport, `.word-counter` fully visible with its Panel button. Record what fails on the branch so far. Also extend the unit CSS guard: `index.css` contains `@media (max-width: 1099px)` and `@media (max-width: 640px)` blocks that set `.editor-wrap` padding (assert the two padding values from Global Constraints appear).
- [ ] **Step 2: Run** the unit guard → FAIL.
- [ ] **Step 3: Implement** in `@media (max-width: 1099px)` (tablet and phone) and `@media (max-width: 640px)` (phone overrides): `.editor-wrap` padding per Global Constraints; `.main-room-body` and `.editor-area` `min-width: 0`; `.topbar` gap and padding for 390px, with `.topbar-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`, the save status `flex-shrink: 0`, and on phone the draft badge hidden and the chapter pill shortened with an ellipsis; `.word-counter` as a flex row with the text centred and `.word-counter-panel` (44px tap area) on the right; `.backup-reminder--banner`, `.editor-loading-note` wrap inside the width (`overflow-wrap: anywhere`).
- [ ] **Step 4: Run** the unit guard and whole suite → PASS; rerun the Playwright probe at the three widths → pass (no horizontal page scroll, top bar and word counter fully visible). Screenshot each into the scratchpad for the card evidence (A1).
- [ ] **Step 5: Commit** `feat(client): fit the Main Room surface to phones and tablets`.

### Task 7: Touch toolbar (→ S3)

**Files:**
- Modify: `client/src/components/editor/Toolbar.jsx`, `client/src/index.css`
- Test: `client/test/toolbarTouch.test.js`

**Interfaces:**
- Consumes: `useLayoutMode`, `setViewport`.

- [ ] **Step 1: Write the failing tests** in `toolbarTouch.test.js`: at 390px a cancelable `mousedown` on each of Bold, Italic, Underline and the three alignment buttons is `defaultPrevented` (the scene-break button already is); at 1280px the same `mousedown` on those buttons is **not** prevented (A4). At 390px a click on Bold still runs the command against the editor (`document.execCommand` stub called once with `'bold'`) and leaves the editor as `document.activeElement`. The font and size selects still call the formatting path when changed under the stubbed phone mode.
- [ ] **Step 2: Run** the file → FAIL.
- [ ] **Step 3: Implement** `onMouseDown={keepFocus}` on the six buttons, where `keepFocus` is `(e) => e.preventDefault()` only when the mode is not desktop and `undefined` otherwise. CSS in `@media (max-width: 1099px)`: `.toolbar { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch }`, its children `flex-shrink: 0`, `.toolbar-btn` `min-width: 44px; height: 44px`, `.toolbar-select` `height: 44px; font-size: 16px`, `.toolbar-divider` unchanged.
- [ ] **Step 4: Run** the file and the whole suite → PASS. Playwright at 390x844: toolbar is one row, scrolls inside itself, every button is at least 44x44 (`getBoundingClientRect`), Spark/History/Summary reachable by scrolling, the page itself has no horizontal scroll; at 1280x800 the toolbar wraps and measures as on `main`.
- [ ] **Step 5: Commit** `feat(client): make the editor toolbar touch-friendly`.

### Task 8: Visual-viewport height and caret kept visible (→ S4)

**Files:**
- Create: `client/src/hooks/useVisualViewport.js`, `client/src/utils/caretVisible.js`, `client/test/visualViewport.test.js`, `client/test/caretVisible.test.js`
- Modify: `client/src/App.jsx` (call the hook in `Layout`), `client/src/pages/MainRoom.jsx` (caret effect), `client/src/index.css`

**Interfaces:**
- Produces: `caretScrollDelta({ caretTop, caretBottom, viewTop, viewBottom, margin }): number` — 0 when the caret line sits inside `[viewTop + margin, viewBottom - margin]`, the positive distance to scroll down when it is below, the negative distance when above.
- Produces: `useVisualViewport(): void` — in tablet and phone modes writes `--app-height` (`visualViewport.height`) and `--app-top` (`visualViewport.offsetTop`) in px on `document.documentElement` on mount and on the viewport's `resize` and `scroll`; removes both in desktop mode and on unmount; does nothing when `window.visualViewport` is missing.
- Produces: in `MainRoom`, an effect (non-desktop modes only) that, while the editor has focus, on `visualViewport` `resize` and on `selectionchange`, scrolls `.editor-wrap` by `caretScrollDelta` computed from the caret's client rect and the intersection of `.editor-wrap` with the visual viewport (margin 24px).

- [ ] **Step 1: Write the failing tests.** `caretVisible.test.js`: delta 0 inside the band; `caretBottom 700, viewBottom 500, margin 24` → `224`; `caretTop 10, viewTop 100, margin 24` → `-114`. `visualViewport.test.js` with a fake `window.visualViewport` (an `EventTarget` with `height`, `offsetTop`): at 390px the variables are set to the fake's values and update after a `resize` event; at 1280px they are not set and a mode change to desktop removes them; with no `visualViewport` nothing throws.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement** the three pieces. CSS in `@media (max-width: 1099px)`: `.layout { position: fixed; top: var(--app-top, 0); left: 0; width: 100%; height: var(--app-height, 100dvh) }` so the layout follows the keyboard and stays pinned when iOS scrolls the page; the bottom sheet's `max-height` already reads `--app-height`. Desktop `.layout` stays `height: 100vh`.
- [ ] **Step 4: Run** both files and the whole suite → PASS. Playwright at 390x844: `getComputedStyle(.layout).height` equals `visualViewport.height`; focus the editor at the end of a long chapter, `browser_resize` to 390x480 (simulated keyboard): the caret's rect lies inside `.editor-wrap`'s visible rect and the toolbar, top bar and word counter are all still on screen; open the sheet at 480px high and confirm it stays within the viewport; `document.scrollingElement.scrollTop` stays 0. Screenshot for A3 evidence.
- [ ] **Step 5: Commit** `feat(client): keep the editor and caret above the on-screen keyboard`.

### Task 9: Autosave flush when the page is hidden (→ S4)

**Files:**
- Modify: `client/src/hooks/useAutosave.js`, `client/src/utils/api.js`, `client/test/support/app.js`
- Test: `client/test/autosaveHidden.test.js` (model on `test/autosaveFlush.test.js`)

**Interfaces:**
- Produces: `api.put(path, body, options?)` — `options` is spread into the `fetch` options (so `{ keepalive: true }` reaches `fetch`); existing callers unchanged.
- Produces: `stubFetch` records `keepalive` on each entry of `calls`.
- Produces: in `useAutosave`, a handler that clears the debounce timer and sends the pending edit at once, registered for `visibilitychange` (only when `document.visibilityState === 'hidden'`) and `pagehide`; `keepalive: true` only when the UTF-8 byte length of `JSON.stringify(body)` is under 60,000.

- [ ] **Step 1: Write the failing tests** in `autosaveHidden.test.js`: after an edit (timer still waiting), setting `document.visibilityState` to `'hidden'` and dispatching `visibilitychange` sends exactly one PUT with the edit's content and `keepalive: true`, and the 5-second timer then sends nothing more; `pagehide` does the same; `visibilitychange` with the state `'visible'` sends nothing. `(Review Focus)` with no pending edit, neither event sends a PUT; `visibilitychange` then `pagehide` for one edit sends one PUT in total; a body over 60,000 bytes is sent with `keepalive` false. Success sets the save status to saved; failure sets it to error.
- [ ] **Step 2: Run** the file → FAIL.
- [ ] **Step 3: Implement** the three changes; the flush reuses `savePending` and `applySaved`, and adds the `keepalive` option.
- [ ] **Step 4: Run** the file and the whole suite → PASS. Playwright at 390x844: type in the editor, dispatch a hidden `visibilitychange` before 5 seconds pass, confirm one PUT in `browser_network_requests` (A3 autosave evidence).
- [ ] **Step 5: Commit** `fix(client): save unsaved text when the page is hidden`.

### Task 10: Desktop regression and cross-width verification (→ S5)

**Files:**
- No source changes expected. Delete `client/vite.check.config.js` at the end. Produces the evidence list for `/task-finish`.

- [ ] **Step 1: Desktop DOM and pixels (A4).** With `main`'s checkout on port 5198 and the branch on 5199 against the same seeded server, for each palette (votive, nave, reliquary, set through `PUT /api/settings`) and each size 1280x800 and 1100x800, load the Main Room on both: compare `document.querySelector('.layout').outerHTML` (identical) and the screenshots (`cmp` the files; if bytes differ, open both and compare by eye and list the difference). Any visible desktop difference is a bug to fix before moving on (loop back to the owning task).
- [ ] **Step 2: Phone and tablet walk (A1, A2, A3).** At 390x844, 768x1024 and 1024x768: overflow probe passes; the nav, chapters (phone only) and panel open and close by button, backdrop and Esc; all four panel tabs work; toolbar scrolls, targets measure 44px; word count and autosave status visible; simulated keyboard keeps the caret visible. Save the screenshots in the scratchpad.
- [ ] **Step 3: Full suites.** `cd client && npm test` and `cd server && npm test`; read the real output; all green.
- [ ] **Step 4: Clean up.** Remove `client/vite.check.config.js`, `.playwright-mcp/` contents and stray images; `git status` shows only intended files.
- [ ] **Step 5: Evidence.** List per acceptance criterion the test names, probe outputs and screenshot paths (below); A3's real-device check is posted as `[after-merge] A3: dev types on a phone against the deployed app`.

## Acceptance coverage

| Criterion | Proven by |
|---|---|
| A1 No horizontal scrolling at 390px and tablet widths | Task 6 and Task 10 overflow probe at 390, 768, 1024 |
| A2 Chapter list and panel open and close as drawers or sheets | `navDrawer`, `chapterDrawer`, `panelDrawer` tests; Task 10 Playwright walk |
| A3 Toolbar, word count, autosave and caret on touch | `toolbarTouch`, `caretVisible`, `visualViewport`, `autosaveHidden` tests; Task 7–9 and 10 Playwright checks; real phone after merge (`[after-merge]`) |
| A4 Desktop layout unchanged | desktop-DOM assertions in Tasks 3, 4, 5, 7; Task 10 `outerHTML` and screenshot comparison in three palettes |

## Self-review

- **Spec coverage:** layout modes (T1); drawers and sheet, open buttons, Spark, app-wide nav (T2–T5); editor padding, top bar and banner fit (T6); toolbar (T7); keyboard, caret, layout pinning (T8); autosave flush (T9); testing and desktop regression (T10). `.page-enter` containing-block fix (T2) is not in the spec; it is required for drawers inside the page to sit against the screen. Scroll lock is done in CSS (`touch-action`, `overscroll-behavior` on the backdrop) because the layout never scrolls the page; the spec's scroll-lock line is met that way. No proposed descope; A3's real-device check is after-merge per D5.
- **Types:** `useDrawer`, `drawerId`, `modeForWidth`, `setViewport`, `caretScrollDelta` and `useVisualViewport` are named the same wherever used.
- **Proportion:** each task names signatures, test names and CSS properties, not function bodies.
