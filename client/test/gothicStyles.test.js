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

test('the helpers find rules by selector', () => {
  assert.ok(rulesFor(':focus-visible').length > 0);
  assert.match(bodyOf(':focus-visible'), /outline: 2px solid var\(--border-focus\)/);
  assert.equal(declares(':focus-visible', /outline-offset: 2px/), true);
});
