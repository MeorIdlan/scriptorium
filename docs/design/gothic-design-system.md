# Gothic design system

The approved design for the classic UI redesign (FR-45, NFR-6). This file is the handoff to the build card, [Apply the gothic redesign to the classic UI](https://trello.com/c/uqVctsf5).

**Sources:**
- [Scriptorium Gothic Screens](https://claude.ai/artifact/E8oEsNutMUyWobkDTBJf1x) and [Scriptorium Gothic Design System](https://claude.ai/artifact/4GUYF6V7p5FKUaQyechXoZ): private artifacts holding a copy of the design. The screens artifact also holds the exact CSS (`gothic.css`, `screens.css`, `overlays.css`, `additions.css`). Use these for the build.
- [Scriptorium Gothic project](https://claude.ai/design/p/2b28e621-4ae5-46b1-9997-f56802dc613b) in Claude Design: where the design was made. A tool note says standalone Claude Design closes by 2026-12-14, so don't rely on it past then.

**IP rule:** no Games Workshop names, logos or iconography in names, copy, ornaments or icons.

## Direction

Stone, gold and candlelight frame the app, and the writing page stays plain and quiet. Keep textures, gradients, masks and filters out of the editor area, so typing stays fast on a 150,000-word work (NFR-3).

## Palettes

Writers choose a palette in Settings. Votive is the default. Token names match `client/src/index.css`.

| Token | Votive | Nave | Reliquary |
|---|---|---|---|
| `--bg` | `#121013` | `#0d1016` | `#150c0e` |
| `--bg-elevated` | `#191518` | `#141821` | `#1e1114` |
| `--bg-card` | `#201b1e` | `#1a1f2b` | `#27161a` |
| `--bg-input` | `#0e0c0f` | `#0a0d12` | `#100909` |
| `--sidebar-bg` | `#0e0c0f` | `#0a0d12` | `#100909` |
| `--border` | `#33292b` | `#2b3242` | `#43252a` |
| `--border-control` | `#7d6f68` | `#707a90` | `#8a6c6c` |
| `--border-focus` | `#d8b468` | `#dcbc78` | `#e0b868` |
| `--gold` | `#d0aa62` | `#d4b472` | `#cfa658` |
| `--gold-dim` | `#b08f50` | `#b2965c` | `#b78f4d` |
| `--gold-hover` | `#e2c07c` | `#e5c98e` | `#e2bd74` |
| `--text` | `#eae2d2` | `#e4e3dc` | `#eee0d0` |
| `--text-muted` | `#aba293` | `#a3a6a8` | `#b5a395` |
| `--text-dim` | `#9b9284` | `#93979c` | `#a69486` |
| `--teal` | `#6cc4a4` | `#62c6b0` | `#6ec4a6` |
| `--purple` | `#a79fe0` | `#a6a2ea` | `#b0a2e0` |
| `--coral` | `#e58461` | `#e6835f` | `#ea8a66` |
| `--amber` | `#e3a548` | `#e5a94e` | `#e6a84a` |
| `--error` | `#ea8f85` | `#ec8e8a` | `#f0958c` |
| `--success` | `#a3d9a0` | `#a0dba8` | `#a8d8a0` |
| `--accent` (new) | `#7c1f1c` | `#27407f` | `#8f1d22` |
| `--accent-hover` (new) | `#93261f` | `#314e97` | `#a82329` |
| `--glass-1` (new, ornament) | `#8f2a24` | `#2c4a9a` | `#a01f26` |
| `--glass-2` (new, ornament) | `#b8863a` | `#8f2a3a` | `#5c1218` |
| `--glow` (new, sidebar only) | `rgba(226, 150, 70, 0.16)` | `rgba(90, 120, 210, 0.16)` | `rgba(190, 50, 50, 0.2)` |

### Contrast

`client/test/contrast.test.js` passes 11 of 11 for each palette. I ran it on throwaway copies of the client with the `:root` values swapped. The test doesn't check `--text` on `--accent` (at least 6.85:1) or on `--accent-hover` (at least 5.52:1), or `--gold-hover` as text, so those figures come from a separate calculation.

## Type

| Role | Face | Size | Use |
|---|---|---|---|
| Display | Pirata One | 44 px | Room headings |
| Title | Pirata One | 32 px | Chapter and entry titles, auth headings |
| Heading | Pirata One | 1.45rem (about 23 px) | Panel and modal headings, work titles |
| Brand | Pirata One | 24 px | Sidebar app name |
| Reading | EB Garamond | 19 px, line height 1.7 | Writing text, diffs |
| Body | Spectral | 15 px | Interface text |
| Small | Spectral | 13 px | Buttons, helper text |
| Label | Spectral 500 | 11 px, uppercase, 0.1em tracking | Section labels |
| Small button | Spectral 500 | 11 px, no transform | `.btn-sm` |

Blackletter never goes below about 23 px. Self-host all three faces, and check each licence when adding it.

## Ornaments and icons

- **Rose window:** a circle with a repeating conic gradient of `--glass-1` and `--glass-2`, a gold centre and a `--gold-dim` ring. Used beside the brand.
- **Lancet:** a pointed-arch mask over a conic gradient of the glass tokens. Used above auth cards.
- **Wax seal:** a round seal with a radial gradient from `--accent-hover` to `--accent`, a soft drop shadow and a `--gold-dim` inner ring. Marks completed works.
- **Quatrefoil divider:** separates groups outside the editor. Never use it in the writing area, because it relies on CSS masks.
- **Double rule:** 3 px, under the brand and modal headers.
- **Corner frame:** small `--gold-dim` corners on the Map's chapter detail.
- **Tome spine:** the left edge of a work card, in the work's cover colour, with two metal bands.
- **Icons:** simple geometric marks for Shelves, Main Room, Map, Codex, Settings, Manage Users and Log out, drawn as CSS masks in `currentColor`.

## Components

Corners are nearly square: `--radius` 2 px, `--radius-sm` 1 px, `--radius-lg` 3 px.

| Component | Default | Hover | Focus | Disabled |
|---|---|---|---|---|
| Primary button | `--accent` fill, `--gold-dim` border, `--text` | `--accent-hover` fill, `--gold` border | Ring | Transparent, dashed `--border-control`, `--text-dim` |
| Secondary button | Transparent, `--gold-dim` border, `--gold` | `--bg-card` fill, `--gold-hover`, `--gold` border | Ring | As above |
| Ghost button | Transparent, `--border-control` border, `--text-muted` | `--bg-card` fill, `--text`, `--text-muted` border | Ring | As above |
| Danger button | Transparent, `--error` border and text | `--bg-card` fill | Ring | As above |
| Input, select, textarea | `--bg-input`, `--border-control` border | `--text-muted` border | Ring with 1 px offset, `--border-focus` border | Dashed border, `--text-dim` |
| Checkbox, radio | `--bg-input`, `--border-control`; checked is `--gold` | `--text-muted` border | Ring | Dashed border |
| Slider | `--gold` accent colour | As default | Ring | Browser default |
| Tab | `--text-muted` | `--text` | Inset ring | `--text-dim` |
| Selected tab | `--gold`, 2 px `--gold` underline | `--gold` | Inset ring | Not used |
| Sidebar item | `--text-muted` | `--text`, faint fill | Inset ring | Not used |
| Selected sidebar item | `--gold`, 2 px left `--gold` bar, faint fill | `--gold` | Inset ring | Not used |

- **Focus ring:** 2 px solid `--border-focus`, offset 2 px. Items at an edge use an inset ring, as `index.css` does today. The editor keeps its existing exception, a 1 px box shadow with no outline.
- **Busy buttons:** keep `aria-disabled` so they hold focus, and use the disabled look.
- **Panel:** flat `--bg-card`, `--border` outline, heading over a 3 px double `--border` rule.
- **Modal:** `--bg-elevated`, `--gold-dim` outline, heading over a 3 px double `--gold-dim` rule, footer actions on the right.
- **Toast:** `--bg-elevated`, `--border-control` outline, 3 px double left edge in `--gold`, `--success` or `--error`.
- **Badge:** 1 px outline on no fill. Default is `--text-muted` on `--border-control`, gold is `--gold` on `--gold-dim`, and purple and teal use one colour for both. Rule category badges keep their tints, which the contrast test requires.
- **Inline errors:** `.form-error` text in `--error`, not a toast, where the app does this today.

## Screens

Every screen is in Votive at desktop width. Nave and Reliquary are shown on Main Room and Shelves.

| Screen | Project file |
|---|---|
| Design system | `Design System.dc.html` (`Main.dc.html` in the artifact) |
| Shelves | `Shelves.dc.html` |
| Main Room | `MainRoom.dc.html` |
| Map | `Map.dc.html` |
| Codex | `Codex.dc.html` |
| Settings, with the palette selector | `Settings.dc.html` |
| Catch overlay | `Catch Overlay.dc.html` |
| Log in, register, code, passkey | `Auth Pages.dc.html` |
| Modal pattern (Export Work) | `Modal Pattern.dc.html` |
| Polish review | `Polish Review.dc.html` |
| History compare | `History Compare.dc.html` |
| New Work wizard, every step | `New Work Wizard.dc.html` |
| Nave and Reliquary | `Palette Variants.dc.html` |

Sample story text and values are invented. Other modals follow the modal pattern, and the admin page follows Settings. The Map's real curve has no heading, and the design adds no new controls apart from the palette selector.

## Notes for the build

- **Tokens alone won't re-theme the app.** `index.css` has about 77 lines with `rgba()` literals, mostly old gold, purple and amber tints, plus `#e8a030`. `TensionCurve.jsx`, `ChapterBlocks.jsx` (`ACT_COLORS`, the missing-beat dot) and `WorkCard.jsx` also hard-code colours. Replace these or derive them from tokens, or Nave ships with warm gold tints. About 40 `font-family` lines in `index.css` bypass any token and need the same treatment. Act colours map to `--teal`, `--purple` and `--coral`.
- **Tests that pin CSS:**
  - `contrast.test.js` reads only one `:root` block. A palette layout like `:root, [data-palette="votive"]` breaks it, and a plain `:root` keeps it green with Nave and Reliquary unchecked. Make it parse every palette block, fail if one is missing, and add `--text` on `--accent` and `--accent-hover`, and `--gold-hover` as text.
  - `focusStyles.test.js` pins the focus ring, the editor exception and edge-item selectors.
  - `mapLayout.test.js` pins Map selectors. Renaming classes fails these tests.
- **Palette selector:** an "Appearance" section at the top of Settings, using the `.pick-card` look in `Settings.dc.html`, and applying straight away.
  - The `Settings` schema has no palette field, and `saveSettings` returns the merged object anyway, so a save could look successful and still be lost. Add the field and validate the three values in `PUT /settings`. (I read this from the code and did not run it.)
  - Save on selection, as `handleToggleAi` does, because `handleSave` sends only named keys. Show an error and keep the previous palette if the save fails.
  - Use native radios, or add arrow-key behaviour. The mock's cards are click-only.
  - Apply the cached palette from an inline script in `index.html`, before the module bundle, so the page doesn't flash the wrong palette. Before sign-in, use the cached palette or Votive.
- **Editor font:** the dev chose EB Garamond 19 as the new default. Add it to `FONTS`, and 19 to `SIZES` and `sizeMap`, in `Toolbar.jsx`, make them the defaults, and update `.editor` (it sets Georgia, 1rem and line height 1.85 today). The other fonts stay available, and existing formatted text stays as it is.
- **Scene marker:** keep the existing `hr[data-scene]`, its status-coloured `⁂` glyph (`--gold`, `--text-dim`, `--amber`, `--teal`) and its title, as `.scene-marker` shows. No quatrefoil or mask.
- **Real controls:** restyle the existing checkboxes and radios, which are already native inputs. Some mockups draw them as styled spans. Wizard hooks stay toggle buttons with `aria-pressed`, because a second click has to clear the optional choice.
- **Behaviour:** the designs change appearance only, apart from the selector and the editor font default. Keep the app's current wording and behaviour wherever a mockup differs.
