# Main Room on phones and tablets: design

Card: https://trello.com/c/cjO2HTdL (epic: Responsive layout, PRD FR-25, MVP 2)
Date: 2026-11-02 · Track: architectural · Branch: `feat/cjO2HTdL-main-room-responsive`

## Intent

Writers should be able to write on a phone or a tablet. Today the Main Room is
built for a wide screen: at desktop width it has three side columns (the app
nav at 200px, the chapter list at 200px, the right panel at 280px, 680px in
all) beside the editor. At 390px the app nav stays and the right panel is
clipped, and even a 768px tablet leaves the editor about 88px. The Main Room is
where writing happens, so it comes first. The dev wants the whole site mobile
friendly in the end; the other rooms are the follow-up card
https://trello.com/c/xkCkHLPZ and are **not** part of this work.

## Goals

- G1. At 390px and at tablet widths, the editor fills the screen with no horizontal
  page scroll (A1).
- G2. The app nav, chapter list and right panel (Quill, Scenes, Codex, Catch) open
  as drawers or sheets from visible buttons and close again (A2).
- G3. Formatting, word count and autosave work with a touch screen, and the
  on-screen keyboard never hides the caret (A3).
- G4. At desktop width (1100px and up) nothing changes: same DOM structure, same
  CSS result (A4).
- G5. The breakpoints and drawer pattern are reusable by the follow-up card without
  rework.

## Non-goals

- Shelves, Map, Codex, Settings, admin and auth pages, and the modals. They keep
  their current layout and get only what the shared nav drawer gives them (see
  "App nav is app-wide"). The follow-up card owns them.
- A visible Catch button on touch devices (follow-up card, S5/A3 there).
- Making the modals responsive. The ones opened from the Main Room (History,
  Summary, Milestones, Polish review, Export) keep their current layout and their
  existing 640px rules; the follow-up card's "Modals" subtask owns them. They must
  still open and close from the new drawers and sheet without losing focus handling.
- Gesture work: no swipe-to-open, no drag-to-resize sheets, no edge tabs.
- Native apps, a PWA shell, offline editing.
- A new design language. Use the gothic tokens and palettes from PR #40 as they are.

## Anti-goals (would make this a failure even if it technically works)

- Any visible change at desktop width.
- Losing state when a drawer closes: a half-typed Quill prompt, the active tab, a
  scroll position, an AI request in flight.
- The keyboard dismissing every time a toolbar button is tapped.
- Typed text lost because the browser was backgrounded before autosave ran.

## Decisions the dev made

- **D1. Three layout modes** (S1):

  | Mode | Width | App nav | Chapter list | Right panel |
  |---|---|---|---|---|
  | desktop | 1100px and up | inline (as today) | inline (as today) | inline (as today) |
  | tablet | 641 to 1099px | left drawer | inline | right drawer |
  | phone | 640px and down | left drawer | left drawer | bottom sheet |

  640px is the breakpoint the stylesheet already uses; 1100px is new.
- **D2. The panel on a phone is a bottom sheet** (about 70% of the screen height),
  with a close button and tap-outside close. The editor stays visible above it.
- **D3. The toolbar is one row that scrolls sideways inside itself** on tablet and
  phone, with 44px touch targets. The page never scrolls sideways.
- **D4. Open buttons** (S2): the top bar gets a menu button on the left (app nav);
  on a phone the chapter pill ("Ch. 3 - Title") becomes the Chapters button; the
  word-counter bar at the bottom of the editor gets a Panel button on its right.
- **D5. A3 evidence:** Playwright with a simulated keyboard (a shrunken visual
  viewport) before the PR; the dev tries it on a real phone against the deployed
  app after merge. That check is recorded as an after-merge criterion, not ticked
  early.

## Design

### Layout modes (S1)

- One source of truth for the numbers in a small module (for example
  `client/src/utils/layoutMode.js`): `PHONE_MAX = 640`, `TABLET_MAX = 1099`, plus a
  `useLayoutMode()` hook built on `matchMedia` that returns `'phone' | 'tablet' | 'desktop'`.
- CSS cannot read JS or custom properties in a media query, so the stylesheet
  repeats the two numbers as literals. A test reads `index.css` and fails if the
  media queries stop matching the constants.
- The follow-up card uses the same module. The Main Room and the follow-up must
  not define their own breakpoints.
- **Editor breathing room:** `.editor-wrap` is `40px 32px` today, which wastes a
  quarter of a 390px screen. In phone mode use `20px 16px`; in tablet mode
  `28px 24px` (my call, see below). The backup-reminder banner and the loading and
  failed-load notes above the editor must wrap inside the width, not widen it.

### Drawers and the sheet (S2)

- **Keep the content mounted.** In tablet and phone modes the same `nav.sidebar`,
  `aside.chapter-sidebar` and `.right-panel` elements get a drawer class and are
  positioned `fixed` and moved off-screen when closed (and made `inert`, so they
  can't take focus or be read). They are not unmounted and not re-created, so
  Quill text, tab, scroll and in-flight requests survive a close. It also keeps the
  desktop DOM identical, which is how A4 is held. `RightPanel`'s tab indicator
  measures its tabs, so a closed panel must be moved away, not `display: none`.
- **One shared mechanism** (a `Drawer` wrapper or a hook plus classes; builder's
  choice) with three placements: `left`, `right`, `bottom`. It owns: a backdrop,
  a close button in the drawer's header, Esc to close, Tab kept inside while open,
  focus moved in on open and returned to the opener on close, tap on the backdrop
  to close, and scroll lock on the page behind.
  `hooks/useModal.js` already does most of this but focuses on mount, so it can't be
  used unchanged on always-mounted content; extend it or add a sibling hook, and
  keep the existing modals' behaviour and tests intact.
- **Open state** lives in `UIContext` (new state and actions). Only one drawer is
  open at a time. All are closed on route change, on a switch of layout mode that
  removes that drawer, and when a chapter is picked from the chapters drawer.
- **Sizes:** left drawers are `min(280px, 85vw)` wide. The tablet right drawer is
  `min(360px, 90vw)`. The phone sheet is at most 70% of the *visual* viewport height.
- **Spark** (toolbar) asks for the Quill tab. In tablet and phone modes it must
  also open the panel, or nothing visible happens.
- **App nav is app-wide.** `Sidebar` lives in the shared layout, so on tablet and
  phone every page gets the menu button and nav drawer, not just the Main Room.
  This is needed for the Main Room anyway and is a gift to the follow-up card. The
  other pages' own content is untouched.

### Open buttons (S2, D4)

- **Menu button** in `TopBar`, tablet and phone modes only, on every route. It is the
  opener for the nav drawer.
- **Chapters button:** on a phone, on the Main Room route only, the existing chapter
  pill is a button opening the chapters drawer. On other routes and other modes it
  stays the plain label it is now.
- **Panel button** in the word-counter bar, tablet and phone modes only, on the
  right. Showing the open-catch count for the chapter on it (as the Catch tab
  already does) is a nice touch but optional.
- Top bar on a phone: menu button, work title (ellipsis when long), save status.
  The draft badge and the long chapter text may be dropped or shortened to fit 390px.
  Builder's call, but the save status must stay visible.
- Buttons are at least 44px in their tap area, have text or an `aria-label`, and set
  `aria-expanded` and `aria-controls`.

### Toolbar on touch (S3)

- Tablet and phone modes: `flex-wrap: nowrap; overflow-x: auto`, controls keep their
  size (`flex-shrink: 0`), 44px minimum tap target. The scrollbar is hidden or
  slim; scrolling must not catch the page. Spark, History and Summary stay at the
  end, in their current order, and show or hide with AI state exactly as now.
- Tapping B, I, U, an alignment or the scene break must not move focus out of the
  editor, hide the keyboard, or lose the selection. The scene-break button already
  stops `mousedown` for this reason; apply the same to the others and check it on a
  touch emulation. The font and size `<select>` handlers
  (`selectPointerDown`, `selectKeyDown`, `execOnSelection`) were written for a
  mouse and keyboard; they must still apply to the writer's selection when the
  native picker opens on touch.
- Desktop (1100px and up): toolbar CSS unchanged, including wrapping.

### Keyboard and caret (S4)

- `.layout` is `height: 100vh` today. Desktop keeps that exactly. In tablet and
  phone modes it uses a height that follows the visual viewport, because on iOS
  Safari and Android Chrome the on-screen keyboard shrinks the visual viewport but
  not the layout viewport or `dvh`. Suggested shape: a small hook that writes
  `window.visualViewport.height` (and `offsetTop`) to a CSS variable such as
  `--app-height` on `resize` and `scroll`, with `100dvh` then `100vh` as fallbacks
  where `visualViewport` is missing.
- With the keyboard open, the chrome still has to leave room: the top bar, toolbar,
  and word-counter bar stay, the editor takes what is left, and the caret line stays
  inside the editor's scroll area with some margin below it. If the caret is
  covered after the viewport shrinks or after typing, scroll it into view (only in
  tablet and phone modes, and only when the editor has focus).
- The bottom sheet's height is capped by the visual viewport, so it sits above the
  keyboard when a Quill field inside it is focused.
- iOS may scroll the page itself to reveal a focused field. The layout must stay
  pinned (no stray page scroll, no gap under the layout) when it does.

### Autosave when the app is backgrounded (S4, A3)

Autosave waits 5 seconds after the last edit and flushes only when the editor goes
away inside the app. A phone that locks the screen or switches apps within those
5 seconds may freeze the page and lose the text. Add a flush of the pending edit
when the page becomes hidden (`visibilitychange` to hidden) and on `pagehide`. The
request has to survive the page going away (`fetch` with `keepalive`, or
equivalent). Browsers cap a `keepalive` body at about 64KB, and a long chapter's
text plus HTML can pass that, so above the cap send an ordinary request: a page that
has just become hidden is usually given time to finish it, which is still better than
waiting for a timer a frozen page never runs. Same behaviour at all widths. This is the one change that is not
layout; it is inside A3 ("autosave works on touch screens") and is listed in the
calls below so the dev can veto it.

## Testing and evidence

- **Unit tests (node:test + linkedom):** layout-mode constants vs `index.css` media
  queries; `UIContext` drawer actions (one at a time, closed on route change and
  chapter pick, closed when the mode removes them); the drawer's Esc, backdrop,
  Tab trap and return-focus; the autosave flush on `visibilitychange` and `pagehide`;
  Spark opening the panel in compact modes; existing client tests stay green. Write
  the failing test first, as the playbook says.
- **Playwright (real layout)** at 390x844 (phone), 768x1024 and 1024x768 (tablet),
  1280x800 (desktop): no horizontal page scroll in the Main Room; each drawer and
  the sheet opens from its button and closes by button, backdrop and Esc; toolbar
  scrolls inside itself and its buttons are 44px; a simulated keyboard (shrinking
  the visual viewport) leaves the caret visible; autosave flushes on a simulated
  hide. Run it on Chromium; also WebKit if the dev has installed its system
  libraries (see Risks).
- **Desktop regression (S5, A4):** screenshots at 1280x800 and 1100x800 of the Main
  Room on `main` and on the branch, in each of the three palettes, compared; and a
  check that the Main Room's desktop DOM is the same structure. Any visible
  difference is a bug.
- **After merge:** the dev types on a real phone against the deployed app (A3).

## Mapping

| Card item | Where in this design |
|---|---|
| S1 Breakpoints | Layout modes, D1 |
| S2 Drawers for the sidebar and right panel | Drawers and the sheet; Open buttons |
| S3 Touch-friendly toolbar | Toolbar on touch |
| S4 On-screen keyboard and caret | Keyboard and caret; Autosave when backgrounded |
| S5 Desktop regression check | Testing and evidence |
| A1 No horizontal scroll | Playwright widths; layout modes |
| A2 Drawers open and close | Drawers and the sheet; Open buttons |
| A3 Touch, word count, autosave, caret | Toolbar on touch; Keyboard and caret; Autosave; D5 |
| A4 Desktop unchanged | Keep content mounted; desktop screenshots |

## Risks

- A wrong `100vh` or a stray page scroll on iOS Safari shows only on a real device
  or WebKit, hence D5.
- Playwright's WebKit on WSL needs system libraries installed by the dev in their own
  terminal (`sudo env "PATH=$PATH" npx playwright install-deps webkit`). Chromium
  runs without that. Linux WebKit and Firefox also focus buttons on click, which
  macOS Safari does not.
- `Sidebar` and `RightPanel` position their active indicators with measured offsets;
  a drawer that moves them with `transform` or hides them can break the measurement.
- `inert` is supported in current browsers; the Safari versions the dev targets
  should be checked, and `aria-hidden` plus `visibility: hidden` is the fallback.
- Changing `--sidebar-width` or `--panel-width` would touch every page; the drawer
  mode should override widths locally, not change the tokens.

## Calls I made (the dev can overrule any of them)

1. Keep drawer content mounted rather than unmounting on close, to protect state.
2. The 1100px upper breakpoint (desktop means 1100px and up).
3. Drawer widths: 280px / 360px, capped at 85% / 90% of the screen.
4. The chapter pill is a button on phones only, and only on the Main Room route.
5. Width alone picks the mode, not `pointer: coarse`: a touch laptop at desktop
   width keeps the desktop layout.
6. The autosave flush on hide and pagehide.
7. No swipe or drag gestures.
8. Editor padding of `28px 24px` on tablet and `20px 16px` on phone.

## Left to the builder

Names of components, hooks and CSS classes; whether the drawer is a wrapper
component or a hook; exact animation timings (reuse the existing 0.15s to 0.22s
transitions, and respect `prefers-reduced-motion` if the stylesheet already does);
the exact shortening of the phone top bar; whether the Panel button shows the catch
count; how the caret-into-view scroll is measured.
