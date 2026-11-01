// Pins for the values the gothic design fixes (card uqVctsf5). Each restyle task adds
// its own tests here, written before the CSS they pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the helpers find rules by selector', () => {
  assert.ok(rulesFor(':focus-visible').length > 0);
  assert.match(bodyOf(':focus-visible'), /outline: 2px solid var\(--border-focus\)/);
  assert.equal(declares(':focus-visible', /outline-offset: 2px/), true);
});
