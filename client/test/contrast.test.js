import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const css = readFileSync(join(srcDir, 'index.css'), 'utf8');

// Three palettes, each a block of colour tokens: Votive on :root (the default), Nave and Reliquary on
// [data-palette]. Every check below runs once per palette.
const PALETTE_SELECTORS = {
  votive: /(?:^|\n)\s*:root,\s*\[data-palette="votive"\]\s*\{([^}]*)\}/,
  nave: /(?:^|\n)\s*\[data-palette="nave"\]\s*\{([^}]*)\}/,
  reliquary: /(?:^|\n)\s*\[data-palette="reliquary"\]\s*\{([^}]*)\}/,
};
const paletteBlocks = {};
const palettes = {};
for (const [name, pattern] of Object.entries(PALETTE_SELECTORS)) {
  const match = css.match(pattern);
  paletteBlocks[name] = match ? match[0] : null;
  palettes[name] = {};
  if (match) {
    for (const [, token, value] of match[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      palettes[name][token] = value;
    }
  }
}

// The hex colour tokens every palette defines (--glow is an rgba and is checked separately)
const COLOUR_TOKENS = [
  'bg', 'bg-elevated', 'bg-card', 'bg-input', 'sidebar-bg',
  'border', 'border-control', 'border-focus',
  'gold', 'gold-dim', 'gold-hover',
  'text', 'text-muted', 'text-dim',
  'teal', 'purple', 'coral', 'amber', 'error', 'success',
  'accent', 'accent-hover', 'glass-1', 'glass-2',
];
const TEXT_TOKENS = ['text', 'text-muted', 'text-dim', 'gold', 'gold-dim', 'gold-hover', 'error', 'success', 'teal', 'purple', 'coral', 'amber'];
const BACKGROUNDS = ['bg', 'bg-elevated', 'bg-card', 'bg-input', 'sidebar-bg'];
const CONTROL_TOKENS = ['border-control', 'border-focus'];

// The palette the current check is running against
let tokens = palettes.votive;
function eachPalette(check) {
  for (const name of Object.keys(PALETTE_SELECTORS)) {
    tokens = palettes[name];
    check(name);
  }
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(name) {
  assert.ok(tokens[name], `--${name} is missing`);
  return tokens[name];
}

test('all three palette blocks exist and define every colour token', () => {
  for (const name of Object.keys(PALETTE_SELECTORS)) {
    assert.ok(paletteBlocks[name], `the ${name} palette block is missing from index.css`);
    for (const colour of COLOUR_TOKENS) assert.ok(palettes[name][colour], `${name}: --${colour} is missing`);
    assert.match(paletteBlocks[name], /--glow\s*:\s*rgba\(/, `${name}: --glow is missing`);
  }
});

test('text tokens meet AA on every background', () => {
  eachPalette((palette) => {
    for (const text of TEXT_TOKENS) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(token(text), token(bg));
        assert.ok(ratio >= 4.5, `${palette}: --${text} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });
});

test('text on the accent fills meets AA', () => {
  eachPalette((palette) => {
    for (const fill of ['accent', 'accent-hover']) {
      const ratio = contrast(token('text'), token(fill));
      assert.ok(ratio >= 4.5, `${palette}: --text on --${fill} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  });
});

test('control borders and focus ring meet 3:1', () => {
  eachPalette((palette) => {
    for (const control of CONTROL_TOKENS) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(token(control), token(bg));
        assert.ok(ratio >= 3, `${palette}: --${control} on --${bg} is ${ratio.toFixed(2)}:1, needs 3:1`);
      }
    }
  });
});

test('text hierarchy is preserved', () => {
  eachPalette((palette) => {
    assert.ok(luminance(token('text-dim')) < luminance(token('text-muted')), `${palette}: --text-dim must be dimmer than --text-muted`);
    assert.ok(luminance(token('text-muted')) < luminance(token('text')), `${palette}: --text-muted must be dimmer than --text`);
  });
});

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  assert.ok(blocks.length, `${selector} rule is missing from index.css`);
  return blocks.map((m) => m[1]).join('\n');
}

// Paints an rgba() tint or a hex colour at its alpha over a solid background, as the browser does
function paint(colour, bgHex) {
  const rgba = colour.match(/rgba?\(([^)]*)\)/);
  const [r, g, b, a = 1] = rgba ? rgba[1].split(',').map(Number) : [...hexChannels(colour), 1];
  const bg = hexChannels(bgHex);
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexChannels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

test('rule category badges meet AA on their tint, on every background', () => {
  const badges = [...css.matchAll(/\n\.(rule-cat-[\w-]+)\s*\{([^}]*)\}/g)];
  assert.equal(badges.length, 5, 'expected one badge rule per category');
  eachPalette((palette) => {
    for (const [, name, body] of badges) {
      const tint = body.match(/background:\s*(rgba\([^)]*\))/);
      const text = body.match(/color:\s*var\(--([\w-]+)\)/);
      assert.ok(tint && text, `.${name} needs a tint background and a colour token`);
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(paint(token(text[1]), token(bg)), paint(tint[1], token(bg)));
        assert.ok(ratio >= 4.5, `${palette}: .${name} text on its tint over --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });
});

// Text that is dimmed with a token and no opacity; the browser paints the element's opacity over its background
const DIMMED_TEXT = ['.thread-chip.resolved:not(.on)', '.chapter-block.dimmed .chapter-block-num'];

test('dimmed text meets AA on every background, with no opacity', () => {
  for (const selector of DIMMED_TEXT) {
    const body = ruleBody(selector);
    const text = body.match(/color:\s*var\(--([\w-]+)\)/);
    assert.ok(text, `${selector} needs a colour token`);
    const alpha = Number((body.match(/opacity:\s*([\d.]+)/) || [])[1] ?? 1);
    assert.equal(alpha, 1, `${selector} dims with opacity ${alpha}; use a text token instead`);
    eachPalette((palette) => {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(paint(token(text[1]), token(bg)), token(bg));
        assert.ok(ratio >= 4.5, `${palette}: ${selector} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    });
  }
});

// The selected block paints its act colour at 20% over --bg-card; its number must read on that tint
test('selected chapter block number meets AA on each act tint', () => {
  const blocksSource = readFileSync(join(srcDir, 'components', 'map', 'ChapterBlocks.jsx'), 'utf8');
  const actColours = [...blocksSource.matchAll(/'Act [IVX]+':\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]);
  assert.equal(actColours.length, 3, 'expected one colour per act in ChapterBlocks.jsx');
  const body = ruleBody('.chapter-block.selected .chapter-block-num');
  const text = body.match(/color:\s*var\(--([\w-]+)\)/);
  assert.ok(text, '.chapter-block.selected .chapter-block-num needs a colour token');
  eachPalette((palette) => {
    // An unknown act falls back to the control border token
    for (const act of [...actColours, token('border-control')]) {
      const tint = paint(`rgba(${hexChannels(act).join(',')}, 0.2)`, token('bg-card'));
      const ratio = contrast(token(text[1]), tint);
      assert.ok(ratio >= 4.5, `${palette}: selected chapter number on the ${act} tint is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  });
  // The selected rule must come after the dimmed one, or a dimmed selected block keeps the dim colour
  assert.ok(
    css.lastIndexOf('.chapter-block.selected .chapter-block-num') > css.indexOf('.chapter-block.dimmed .chapter-block-num'),
    'selected number rule must follow the dimmed rule'
  );
});

test('a dimmed chapter block recedes without opacity', () => {
  assert.doesNotMatch(ruleBody('.chapter-block.dimmed'), /opacity\s*:/);
});

test('clickable map controls use the control border token (not the divider)', () => {
  for (const selector of ['.thread-status', '.chapter-block']) {
    const border = ruleBody(selector).match(/border:\s*\d+px solid ([^;]+);/);
    assert.ok(border, `${selector} has no solid border`);
    assert.equal(border[1].trim(), 'var(--border-control)', `${selector} border must use var(--border-control)`);
  }
});

test('no hard-coded text colours outside the token blocks', () => {
  // The palette blocks and the plain :root block hold tokens, not rules
  let outsideTokens = css.replace(/(?:^|\n)\s*:root\s*\{[^}]*\}/g, '\n');
  for (const block of Object.values(paletteBlocks)) outsideTokens = outsideTokens.replace(block, '\n');
  const colorDecl = /(?:^|[\s;{])color\s*:\s*([^;}]+)/g;
  const hardCoded = /^(#[0-9a-fA-F]{3,8}\b|rgba?\()/i;
  const offenders = [...outsideTokens.matchAll(colorDecl)]
    .map((m) => m[1].trim())
    .filter((value) => hardCoded.test(value));
  assert.deepEqual(offenders, [], `hard-coded text colours in index.css: ${offenders.join(', ')}`);
});

test('no hard-coded border colours in jsx inline styles', () => {
  const jsxFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.jsx')) jsxFiles.push(path);
    }
  };
  walk(srcDir);
  const inlineBorder = /border(?:Color)?\s*:\s*['"`][^'"`]*#[0-9a-fA-F]{3,8}\b/i;
  const offenders = jsxFiles.filter((file) => inlineBorder.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => file.slice(srcDir.length + 1)), [], 'inline hex border colours in jsx');
});

test('no hard-coded text colours in jsx inline styles', () => {
  const jsxFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.jsx')) jsxFiles.push(path);
    }
  };
  walk(srcDir);
  const inlineColor = /color\s*:\s*['"`]\s*(#|rgba?\()/i;
  const offenders = jsxFiles.filter((file) => inlineColor.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => file.slice(srcDir.length + 1)), [], 'inline hex/rgb text colours in jsx');
});
