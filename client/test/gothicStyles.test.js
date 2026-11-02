// Pins for the values the gothic design fixes (card uqVctsf5). Each restyle task adds
// its own tests here, written before the CSS they pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every declaration block with its selector list split on commas, as mapLayout.test.js does
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body: body.replace(/\s+/g, ' ').trim(),
}));

export const rulesFor = (selector) => rules.filter((r) => r.selectors.includes(selector));
export const declares = (selector, pattern) => rulesFor(selector).some((r) => pattern.test(r.body));
const bodyOf = (selector) => rulesFor(selector).map((r) => r.body).join(' ');

test('the shared tokens: fonts, type sizes and radii', () => {
  const root = rules.find((r) => r.selectors.length === 1 && r.selectors[0] === ':root');
  assert.ok(root, 'the plain :root block is missing');
  const expected = {
    '--font-display': "'Pirata One', Georgia, serif",
    '--font-reading': "'EB Garamond', Georgia, serif",
    '--font-ui': "'Spectral', Georgia, serif",
    '--type-reading': '1.1875rem',
    '--radius': '2px',
    '--radius-sm': '1px',
    '--radius-lg': '3px',
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(root.body.includes(`${name}: ${value};`), `${name} should be ${value}`);
  }
});

test('the editor uses the reading font at 19px with a 1.7 line height', () => {
  const editor = bodyOf('.editor');
  assert.match(editor, /font-family: var\(--font-reading\)/);
  assert.match(editor, /font-size: var\(--type-reading\)/);
  assert.match(editor, /line-height: 1\.7(?:;|$)/);
});

// Palette colours come from tokens, so Nave and Reliquary never show Votive's tints. Black and white
// (scrims, shadows, neutral hovers) are the only literals left.
function literalColours(text) {
  const found = [];
  for (const [literal] of text.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = literal.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    const channels = hex
      ? (hex[1].length === 3 ? [...hex[1]].map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)))
      : literal.match(/rgba?\(([^)]*)\)/)[1].split(',').slice(0, 3).map((n) => Number(n));
    const neutral = channels.every((c) => c === 0) || channels.every((c) => c === 255);
    if (!neutral) found.push(literal);
  }
  return found;
}

test('index.css has no palette-coloured literals outside the palette blocks', () => {
  const tokenBlocks = /(?:^|\n)\s*(?::root,\s*\[data-palette="votive"\]|\[data-palette="nave"\]|\[data-palette="reliquary"\])\s*\{[^}]*\}/g;
  assert.deepEqual(literalColours(css.replace(tokenBlocks, '\n')), []);
});

test('no jsx file has a palette-coloured literal', () => {
  const srcDir = join(here, '..', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.jsx')) {
        const found = literalColours(readFileSync(path, 'utf8'));
        if (found.length) offenders.push(`${path.slice(srcDir.length + 1)}: ${found.join(', ')}`);
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});

// The Map's SVG and missing-beat dot take their colour from tokens through classes; without
// these rules the curve loses its stroke and the dots turn black
test('the tension curve and missing-beat dot are painted from tokens', () => {
  assert.equal(declares('.tension-grid', /stroke: var\(--border\)/), true);
  assert.equal(declares('.tension-line', /stroke: var\(--gold\)/), true);
  assert.equal(declares('.tension-dot', /fill: var\(--gold\)/), true);
  assert.equal(declares('.tension-dot--beat', /fill: var\(--amber\)/), true);
  assert.equal(declares('.tension-beat-label', /fill: var\(--amber\)/), true);
  assert.equal(declares('.chapter-block-missing-dot', /background: var\(--amber\)/), true);
});

test('the scene marker title uses the interface font and its glyph keeps its status colours', () => {
  assert.equal(declares('.editor hr[data-scene]::after', /font-family: var\(--font-ui\)/), true);
  assert.equal(declares('.editor hr[data-scene]::before', /color: var\(--gold\)/), true);
  assert.equal(declares(".editor hr[data-scene][data-status='todo']::before", /color: var\(--text-dim\)/), true);
  assert.equal(declares(".editor hr[data-scene][data-status='revise']::before", /color: var\(--amber\)/), true);
  assert.equal(declares(".editor hr[data-scene][data-status='done']::before", /color: var\(--teal\)/), true);
});

// Layout: sidebar and top bar (handoff Components and Ornaments)
test('the sidebar glows from the top and its brand sits over a double rule', () => {
  assert.match(bodyOf('.sidebar'), /var\(--glow\)/);
  assert.match(bodyOf('.sidebar'), /var\(--sidebar-bg\)/);
  assert.match(bodyOf('.sidebar-brand'), /border-bottom: 3px double var\(--gold-dim\)/);
  assert.match(bodyOf('.sidebar-brand-link'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.sidebar-brand-link'), /font-size: 1\.5rem/);
});

test('the selected sidebar item is gold with a 2px gold bar and a faint fill', () => {
  assert.match(bodyOf('.sidebar-nav-indicator'), /width: 2px/);
  assert.match(bodyOf('.sidebar-nav-indicator'), /background: var\(--gold\)/);
  assert.match(bodyOf('.sidebar-nav-item.active'), /color: var\(--gold\)/);
  assert.match(bodyOf('.sidebar-nav-item'), /color: var\(--text-muted\)/);
  assert.match(bodyOf('.sidebar-nav-item:hover'), /color: var\(--text\)/);
});

test('the rose window and the room icons are drawn in CSS', () => {
  assert.match(bodyOf('.rose'), /repeating-conic-gradient\(var\(--glass-1\)[^)]*var\(--glass-2\)/);
  assert.match(bodyOf('.rose'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.ic'), /background: currentColor/);
  for (const name of ['shelves', 'room', 'map', 'codex', 'settings', 'users', 'out']) {
    assert.match(bodyOf(`.ic-${name}`), /mask-image: url\("data:image\/svg\+xml/, `.ic-${name} has no mask`);
  }
});

test('the top bar is elevated, with a quiet chapter pill and an outlined draft badge', () => {
  assert.match(bodyOf('.topbar'), /background: var\(--bg-elevated\)/);
  assert.match(bodyOf('.topbar-chapter-pill'), /border-left: 1px solid var\(--border\)/);
  assert.doesNotMatch(bodyOf('.topbar-chapter-pill'), /border-radius: 999px/);
  assert.match(bodyOf('.topbar-draft-badge'), /color: var\(--purple\)/);
  assert.match(bodyOf('.topbar-draft-badge'), /border: 1px solid var\(--purple\)/);
  assert.match(bodyOf('.save-status.saved'), /color: var\(--success\)/);
});

test('the page text is 15px interface text with a 1.55 line height', () => {
  assert.match(bodyOf('body'), /font-size: var\(--type-body\)/);
  assert.match(bodyOf('body'), /line-height: 1\.55/);
});

// Shared components (handoff Components table). Hover and disabled rules carry the :not() guards the
// app already uses, so a busy (aria-disabled) button keeps its disabled look and never takes the hover.
const NOT_BUSY = ':hover:not(:disabled):not([aria-disabled="true"])';
const BUSY = ['.btn:disabled', '.btn[aria-disabled="true"]'];

test('buttons: primary is accent, secondary is outlined gold, ghost is quiet, danger is error', () => {
  assert.match(bodyOf('.btn'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.btn'), /font-size: var\(--type-small\)/);
  assert.match(bodyOf('.btn-primary'), /background: var\(--accent\)/);
  assert.match(bodyOf('.btn-primary'), /color: var\(--text\)/);
  assert.match(bodyOf(`.btn-primary${NOT_BUSY}`), /background: var\(--accent-hover\)/);
  assert.match(bodyOf(`.btn-primary${NOT_BUSY}`), /border-color: var\(--gold\)/);
  assert.match(bodyOf('.btn-secondary'), /background: transparent/);
  assert.match(bodyOf('.btn-secondary'), /color: var\(--gold\)/);
  assert.match(bodyOf(`.btn-secondary${NOT_BUSY}`), /background: var\(--bg-card\)/);
  assert.match(bodyOf(`.btn-secondary${NOT_BUSY}`), /color: var\(--gold-hover\)/);
  assert.match(bodyOf('.btn-ghost'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf(`.btn-ghost${NOT_BUSY}`), /background: var\(--bg-card\)/);
  assert.match(bodyOf('.btn-danger'), /color: var\(--error\)/);
  assert.match(bodyOf('.btn-danger'), /border: 1px solid var\(--error\)/);
  assert.match(bodyOf('.btn-danger'), /background: transparent/);
  assert.match(bodyOf('.btn-sm'), /font-size: var\(--type-label\)/);
});

test('buttons: disabled and busy look the same, dashed, with no opacity', () => {
  for (const selector of BUSY) {
    const disabled = bodyOf(selector);
    assert.match(disabled, /border: 1px dashed var\(--border-control\)/, selector);
    assert.match(disabled, /color: var\(--text-dim\)/, selector);
    assert.match(disabled, /background: transparent/, selector);
    assert.doesNotMatch(disabled, /opacity/, selector);
  }
});

test('fields: input fill, control border, hover, focus ring with a 1px offset, dashed when disabled', () => {
  assert.match(bodyOf('.form-input'), /background: var\(--bg-input\)/);
  assert.match(bodyOf('.form-input'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.form-input'), /font-size: var\(--type-body\)/);
  assert.match(bodyOf('.form-input:hover'), /border-color: var\(--text-muted\)/);
  const focus = bodyOf('.form-input:focus-visible');
  assert.match(focus, /outline: 2px solid var\(--border-focus\)/);
  assert.match(focus, /outline-offset: 1px/);
  assert.match(focus, /border-color: var\(--border-focus\)/);
  assert.match(bodyOf('.form-input:disabled'), /border-style: dashed/);
  assert.match(bodyOf('.form-input:disabled'), /color: var\(--text-dim\)/);
  assert.match(bodyOf('.form-label'), /color: var\(--text-muted\)/);
});

test('checkboxes, radios and sliders are gold', () => {
  assert.match(bodyOf('input[type="checkbox"]'), /accent-color: var\(--gold\)/);
  assert.match(bodyOf('input[type="range"]'), /accent-color: var\(--gold\)/);
});

test('panels, modals and toasts: flat card, gold-dim modal over a double rule, double-edged toast', () => {
  assert.match(bodyOf('.card'), /background: var\(--bg-card\)/);
  assert.match(bodyOf('.card'), /border: 1px solid var\(--border\)/);
  assert.match(bodyOf('.modal'), /background: var\(--bg-elevated\)/);
  assert.match(bodyOf('.modal'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.modal-header'), /border-bottom: 3px double var\(--gold-dim\)/);
  assert.match(bodyOf('.modal-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.modal-title'), /font-size: var\(--type-heading\)/);
  assert.match(bodyOf('.modal-footer'), /border-top: 1px solid var\(--border\)/);
  assert.match(bodyOf('.modal-backdrop'), /rgba\(0, 0, 0, 0\.62\)/);
  assert.match(bodyOf('.settings-toast'), /background: var\(--bg-elevated\)/);
  assert.match(bodyOf('.settings-toast'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.settings-toast'), /border-left: 3px double var\(--gold\)/);
});

// Shelves, work cards and the New Work wizard
test('Shelves: a Pirata One title, a grid of 280px tomes, and a shelf board', () => {
  assert.match(bodyOf('.shelves-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.shelves-title'), /font-size: var\(--type-display\)/);
  assert.match(bodyOf('.work-grid'), /minmax\(280px, 1fr\)/);
  assert.match(bodyOf('.shelf-board'), /border-top: 1px solid var\(--gold-dim\)/);
});

test('the work card is a tome: an 18px spine beside the body, flat, gold-dim on hover', () => {
  const card = bodyOf('.work-card');
  assert.match(card, /display: grid/);
  assert.match(card, /grid-template-columns: 18px minmax\(0, 1fr\)/);
  assert.match(card, /border: 1px solid var\(--border\)/);
  assert.match(card, /border-radius: var\(--radius\)/);
  assert.match(bodyOf('.work-card:hover'), /border-color: var\(--gold-dim\)/);
  assert.match(bodyOf('.work-card-spine'), /background: var\(--spine, var\(--accent\)\)/);
  assert.match(bodyOf('.work-card-spine::before'), /background: var\(--gold-dim\)/);
  assert.match(bodyOf('.work-card-spine::after'), /background: var\(--gold-dim\)/);
});

test('the work card title is blackletter and the genre and status are outlined badges', () => {
  assert.match(bodyOf('.work-card-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.work-card-title'), /font-size: var\(--type-heading\)/);
  assert.match(bodyOf('.work-card-genre'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.work-card-genre'), /background: none|background: transparent/);
  // A stored status of drafting or draft has no class of its own, so gold is the base look
  assert.match(bodyOf('.work-card-status'), /color: var\(--gold\)/);
  assert.match(bodyOf('.work-card-status'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.status-active'), /color: var\(--gold\)/);
  assert.match(bodyOf('.status-completed'), /color: var\(--teal\)/);
  assert.match(bodyOf('.work-card-progress-fill'), /background: var\(--gold-dim\)/);
});

test('the wax seal is a red disc with a gold-dim ring', () => {
  assert.match(bodyOf('.seal'), /radial-gradient\(circle at 36% 32%, var\(--accent-hover\), var\(--accent\) 70%\)/);
  assert.match(bodyOf('.seal::after'), /border: 1px solid var\(--gold-dim\)/);
});

test('the wizard: step dots, blackletter step titles, and a selected hook with an inset gold ring', () => {
  assert.match(bodyOf('.wizard-step-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.wizard-step-dot'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.wizard-step-dot.done'), /background: var\(--gold-dim\)/);
  assert.match(bodyOf('.wizard-step-dot.active'), /background: var\(--gold\)/);
  assert.match(bodyOf('.wizard-hook-card'), /background: var\(--bg-input\)/);
  assert.match(bodyOf('.wizard-hook-card'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.wizard-hook-card.selected'), /border-color: var\(--gold\)/);
  assert.match(bodyOf('.wizard-hook-card.selected'), /box-shadow: inset 0 0 0 1px var\(--gold\)/);
});

test('the backup reminder on a card is amber under a rule', () => {
  assert.match(bodyOf('.backup-reminder'), /color: var\(--amber\)/);
  assert.match(bodyOf('.backup-reminder--card'), /border-top: 1px solid var\(--border\)/);
});

// Main Room
test('buttons and fields take the page font instead of the browser default', () => {
  for (const tag of ['button', 'input', 'select', 'textarea']) {
    assert.match(bodyOf(tag), /font-family: inherit/, tag);
  }
});

test('the chapter list: 2px gold bar and a card fill on the open chapter, label-style heading', () => {
  assert.match(bodyOf('.chapter-item'), /border-left: 2px solid transparent/);
  assert.match(bodyOf('.chapter-item'), /padding: 7px 12px/);
  assert.match(bodyOf('.chapter-item.active'), /border-left-color: var\(--gold\)/);
  assert.match(bodyOf('.chapter-item.active'), /background: var\(--bg-card\)/);
  assert.match(bodyOf('.chapter-item.active'), /color: var\(--gold\)/);
  assert.match(bodyOf('.chapter-sidebar-title'), /font-size: var\(--type-label\)/);
  assert.match(bodyOf('.chapter-sidebar-title'), /letter-spacing: 0\.1em/);
  assert.match(bodyOf('.chapter-item-badge.outline'), /border: 1px solid var\(--purple\)/);
});

test('the toolbar, word counter and panel tabs', () => {
  assert.match(bodyOf('.toolbar'), /padding: 7px 12px/);
  assert.match(bodyOf('.toolbar-btn:hover'), /color: var\(--text\)/);
  assert.match(bodyOf('.toolbar-btn:hover'), /border-color: var\(--border-control\)/);
  assert.match(bodyOf('.word-counter'), /font-variant-numeric: tabular-nums/);
  assert.match(bodyOf('.word-counter'), /border-top: 1px solid var\(--border\)/);
  assert.match(bodyOf('.panel-tab'), /font-size: var\(--type-small\)/);
  assert.match(bodyOf('.panel-tab.active'), /color: var\(--gold\)/);
  assert.match(bodyOf('.editor-wrap'), /padding: 40px 32px/);
});

// The writing page stays plain so typing stays fast on a long work (NFR-3): nothing in the editor
// area but flat colour. The one shadow is the 1px focus ring the focus test pins.
test('the editor and its scroll area have no gradient, mask, filter, image or shadow', () => {
  const offenders = rules
    .filter((r) => r.selectors.some((s) => /^\.editor(?:-wrap)?(?![\w-])/.test(s)))
    .filter((r) => !r.selectors.includes('.editor:focus-visible'))
    .filter((r) => /gradient|mask|filter|url\(|box-shadow/.test(r.body))
    .map((r) => r.selectors.join(', '));
  assert.deepEqual(offenders, []);
});

// Map
test('the Map: a blackletter title, panel headings over a double rule, and quiet blocks', () => {
  assert.match(bodyOf('.map-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.map-title'), /font-size: var\(--type-display\)/);
  assert.match(bodyOf('.thread-manager-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.thread-lanes-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.thread-manager-head'), /border-bottom: 3px double var\(--border\)/);
  assert.match(bodyOf('.chapter-block'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.chapter-block:hover'), /background: var\(--bg-input\)/);
  assert.match(bodyOf('.chapter-block.selected'), /box-shadow: inset 0 0 0 1px var\(--act, var\(--gold\)\)/);
  assert.match(bodyOf('.chapter-block-tick'), /background: var\(--text-dim\)/);
  assert.match(bodyOf('.map-scene'), /border-radius: var\(--radius\)/);
});

test('the corner frame is two small gold-dim corners', () => {
  assert.match(bodyOf('.corners::before'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.corners::after'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.corners'), /position: relative/);
});

// Codex
test('the Codex: blackletter entry titles and section dividers, 2px gold bar on the open entry', () => {
  assert.match(bodyOf('.codex-entry-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.codex-entry-title'), /font-size: var\(--type-title\)/);
  assert.match(bodyOf('.codex-section-divider'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.codex-section-divider'), /color: var\(--gold-dim\)/);
  assert.match(bodyOf('.codex-section-divider::after'), /flex: 1/);
  assert.match(bodyOf('.codex-section-divider::after'), /border-bottom: 1px solid var\(--border\)/);
  assert.match(bodyOf('.codex-entity-item'), /border-left: 2px solid transparent/);
  assert.match(bodyOf('.codex-entity-item.active'), /border-left-color: var\(--gold\)/);
  assert.match(bodyOf('.codex-entity-item.active'), /background: var\(--bg-card\)/);
  assert.match(bodyOf('.codex-tabs .codex-tab'), /font-size: var\(--type-small\)/);
  assert.match(bodyOf('.codex-detail-col'), /padding: 26px 30px/);
  assert.match(bodyOf('.codex-flags-title'), /font-size: var\(--type-label\)/);
  assert.match(bodyOf('.codex-flags-title'), /letter-spacing: 0\.1em/);
});

// Settings and admin
test('Settings: a blackletter title, sections as flat panels with a double-ruled heading', () => {
  assert.match(bodyOf('.settings-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.settings-title'), /font-size: var\(--type-display\)/);
  assert.match(bodyOf('.settings-section'), /border-radius: var\(--radius\)/);
  assert.match(bodyOf('.settings-section-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.settings-section-title'), /border-bottom: 3px double var\(--border\)/);
  assert.match(bodyOf('.key-set-badge'), /border: 1px solid var\(--success\)/);
});

test('palette cards: three columns, each in its own colours, gold when chosen, ringed on keyboard focus', () => {
  assert.match(bodyOf('.pick'), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(bodyOf('.pick-card'), /background: var\(--bg\)/);
  assert.match(bodyOf('.pick-card'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.pick-card'), /color: var\(--text\)/);
  assert.match(bodyOf('.pick-card:has(input:checked)'), /border-color: var\(--gold\)/);
  assert.match(bodyOf('.pick-card:has(input:checked)'), /box-shadow: inset 0 0 0 1px var\(--gold\)/);
  assert.match(bodyOf('.pick-card:has(input:focus-visible)'), /outline: 2px solid var\(--border-focus\)/);
  // The radio is native but drawn away: the card is what the writer sees
  assert.match(bodyOf('.pick-card input'), /position: absolute/);
  assert.match(bodyOf('.pick-card input'), /opacity: 0/);
  assert.match(bodyOf('.pick-strip'), /display: flex/);
  assert.match(bodyOf('.pick-strip i'), /flex: 1/);
});

test('admin buttons: disabled is dashed and dim, like every other disabled button', () => {
  for (const selector of ['.admin-users-table button:disabled', '.admin-users-table button[aria-disabled="true"]']) {
    const body = bodyOf(selector);
    assert.match(body, /border: 1px dashed var\(--border-control\)/, selector);
    assert.match(body, /color: var\(--text-dim\)/, selector);
    assert.doesNotMatch(body, /opacity/, selector);
  }
});

// Auth pages and the Catch overlay
test('the auth card sits under the lancet: a gold-dim outline with a double rule on top', () => {
  assert.match(bodyOf('.auth-page'), /flex-direction: column/);
  const card = bodyOf('.auth-card');
  assert.match(card, /background: var\(--bg-card\)/);
  assert.match(card, /border: 1px solid var\(--gold-dim\)/);
  assert.match(card, /border-top: 3px double var\(--gold-dim\)/);
  assert.match(card, /margin-top: -6px/);
  assert.match(bodyOf('.auth-card h1'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.auth-card h1'), /font-size: var\(--type-title\)/);
  assert.match(bodyOf('.auth-card input'), /background: var\(--bg-input\)/);
  assert.match(bodyOf('.auth-card input'), /border: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.auth-card input:focus-visible'), /outline-offset: 1px/);
  assert.match(bodyOf('.auth-card button'), /background: var\(--accent\)/);
  assert.match(bodyOf('.auth-card button'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.auth-card button:disabled'), /border: 1px dashed var\(--border-control\)/);
  assert.match(bodyOf('.auth-card input.otp-input'), /letter-spacing: 0\.4em/);
});

test('the lancet is a pointed arch of the glass tokens, drawn with a mask', () => {
  assert.match(bodyOf('.lancet'), /conic-gradient\(from 180deg at 50% 62%, var\(--glass-1\), var\(--glass-2\)/);
  assert.match(bodyOf('.lancet'), /mask: url\("data:image\/svg\+xml/);
});

test('the Catch overlay takes the modal look: gold-dim outline, double-ruled blackletter heading', () => {
  assert.match(bodyOf('.catch-overlay'), /border: 1px solid var\(--gold-dim\)/);
  assert.match(bodyOf('.catch-overlay-header'), /border-bottom: 3px double var\(--gold-dim\)/);
  assert.match(bodyOf('.catch-overlay-title'), /font-family: var\(--font-display\)/);
  assert.match(bodyOf('.catch-overlay-title'), /font-size: var\(--type-heading\)/);
  assert.match(bodyOf('.catch-overlay-input:focus-visible'), /border-color: var\(--border-focus\)/);
});

// Modals: Export, Polish review, History and compare
test('modal choices: a chosen format or layout is a gold edge on a card fill', () => {
  assert.match(bodyOf('.format-btn'), /border: 1px solid var\(--border-control\)/);
  const active = bodyOf('.format-btn.active');
  assert.match(active, /border-color: var\(--gold\)/);
  assert.match(active, /color: var\(--gold\)/);
  assert.match(active, /background: var\(--bg-card\)/);
  assert.match(bodyOf('.polish-change-btn.active'), /color: var\(--gold\)/);
  assert.match(bodyOf('.polish-change-btn.active'), /background: var\(--bg-card\)/);
});

test('History: the chosen snapshot has a 2px gold bar on a card fill, and day headings are labels', () => {
  assert.match(bodyOf('.history-item'), /border-left: 2px solid transparent/);
  assert.match(bodyOf('.history-item.active'), /border-left-color: var\(--gold\)/);
  assert.match(bodyOf('.history-item.active'), /background: var\(--bg-card\)/);
  assert.match(bodyOf('.history-day'), /font-size: var\(--type-label\)/);
  assert.match(bodyOf('.history-day'), /letter-spacing: 0\.1em/);
});

test('diffs: removed text is error and struck, added text is success and underlined, in the reading face', () => {
  assert.match(bodyOf('.polish-del'), /color: var\(--error\)/);
  assert.match(bodyOf('.polish-del'), /text-decoration: line-through/);
  assert.match(bodyOf('.polish-add'), /color: var\(--success\)/);
  assert.match(bodyOf('.polish-add'), /text-decoration: underline/);
  for (const selector of ['.polish-review-body', '.history-fulltext', '.version-diff-body']) {
    assert.match(bodyOf(selector), /font-family: var\(--font-reading\)/, selector);
    assert.match(bodyOf(selector), /font-size: var\(--type-reading\)/, selector);
    assert.match(bodyOf(selector), /line-height: 1\.7(?:;|$)/, selector);
  }
});

// Small screens: the @media rules take tokens and fonts only; their structure is not part of this redesign
function mediaBlocks() {
  const blocks = [];
  for (const match of css.matchAll(/@media[^{]*\{/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push(css.slice(match.index, i));
  }
  return blocks;
}

test('the small-screen rules hold no palette-coloured literal and no raw font', () => {
  const blocks = mediaBlocks();
  assert.equal(blocks.length, 4, 'expected the four existing @media blocks');
  for (const block of blocks) {
    assert.deepEqual(literalColours(block), [], block.slice(0, 60));
    for (const [, value] of block.matchAll(/font-family:\s*([^;}]+)/g)) {
      assert.match(value.trim(), /^(inherit|var\(--font-(display|reading|ui)\))$/, block.slice(0, 60));
    }
  }
});

// Codex sheet: two columns of fields, label above value, long text across both columns
test('the Codex sheet is two columns; each field is a label over a ruled value', () => {
  assert.match(bodyOf('.codex-entry-fields'), /display: grid/);
  assert.match(bodyOf('.codex-entry-fields'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(bodyOf('.codex-section-divider'), /grid-column: 1 \/ -1/);
  assert.match(bodyOf('.inline-field--wide'), /grid-column: 1 \/ -1/);
  assert.match(bodyOf('.inline-field'), /flex-direction: column/);
  assert.match(bodyOf('.inline-field-label'), /text-transform: uppercase/);
  assert.match(bodyOf('.inline-field-label'), /letter-spacing: 0\.1em/);
  assert.match(bodyOf('.inline-field-value'), /border-bottom: 1px solid var\(--border-control\)/);
  assert.match(bodyOf('.inline-field-value:hover'), /border-bottom-color: var\(--gold\)/);
});

// Found by the final review
test('the open card menu stays above the cards below it: the menu header makes no stacking context of its own', () => {
  assert.doesNotMatch(bodyOf('.work-card-header'), /z-index/);
  assert.match(bodyOf('.work-card-menu'), /z-index: 10/);
});

test('the quatrefoil divider is a gold-dim line with a four-lobed mask, kept out of the editor', () => {
  const quatrefoil = bodyOf('.quatrefoil');
  assert.match(quatrefoil, /color: var\(--gold-dim\)/);
  assert.match(quatrefoil, /background: currentColor/);
  assert.match(quatrefoil, /mask: url\("data:image\/svg\+xml/);
  const insideEditor = rules.filter((r) => r.selectors.some((s) => /^\.editor/.test(s) && s.includes('quatrefoil')));
  assert.deepEqual(insideEditor, []);
});

// Found in the side-by-side check against the boards (A1)
test('page widths follow the boards: a 66ch writing column, full-width Shelves, 28px by 32px Map padding', () => {
  assert.match(bodyOf('.editor'), /max-width: 66ch/);
  assert.doesNotMatch(bodyOf('.shelves-page'), /max-width/);
  assert.match(bodyOf('.map-view'), /padding: 28px 32px/);
});

test('the helpers find rules by selector', () => {
  assert.ok(rulesFor(':focus-visible').length > 0);
  assert.match(bodyOf(':focus-visible'), /outline: 2px solid var\(--border-focus\)/);
  assert.equal(declares(':focus-visible', /outline-offset: 2px/), true);
});
