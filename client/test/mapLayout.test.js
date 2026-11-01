import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every declaration block, with its selector list split on commas
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((s) => s.trim()),
  body,
}));

const rulesFor = (selector) => rules.filter((r) => r.selectors.includes(selector));
const declares = (selector, pattern) => rulesFor(selector).some((r) => pattern.test(r.body));

// A flex item that must not shrink: flex-shrink: 0, or flex: none / 0 0 auto
const NO_SHRINK = /flex-shrink:\s*0\b|flex:\s*(none|0\s+0\s+auto)\b/;

// The Map's direct children. The curve section clips its overflow, so a flex column
// that is allowed to shrink it squashes the tension curve once the page is taller
// than the view (found in production on 2026-11-01: 138px down to 46px)
const SECTIONS = ['.map-header', '.map-curve-section', '.map-blocks-section', '.map-threads-section', '.map-detail-section'];

test('the Map scrolls when its content is taller than the view', () => {
  assert.ok(declares('.map-view', /overflow-y:\s*auto/), '.map-view must scroll');
  assert.ok(declares('.map-view', /display:\s*flex/) && declares('.map-view', /flex-direction:\s*column/), '.map-view is the flex column the sections sit in');
});

test('no Map section shrinks below its content to fit the view', () => {
  for (const selector of SECTIONS) {
    const keeps = declares(selector, NO_SHRINK) || declares('.map-view > *', NO_SHRINK);
    assert.ok(keeps, `${selector} can shrink: add flex-shrink: 0 (the Map scrolls instead)`);
  }
});

test('the guard finds the sections it is about', () => {
  for (const selector of SECTIONS) assert.ok(rulesFor(selector).length > 0, `${selector} is no longer in index.css; update this test`);
});
