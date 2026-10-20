import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8');

// Every flat rule block: its selector list and its declarations.
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(),
  body: body.replace(/\s+/g, ' ').trim(),
}));

const FOCUS_RING = /(?:^|;)\s*outline:\s*2px solid var\(--border-focus\)\s*(?:;|$)/;
const FOCUS_OFFSET = /(?:^|;)\s*outline-offset:\s*2px\s*(?:;|$)/;
const REMOVES_OUTLINE = /(?:^|;)\s*outline:\s*(?:none|0)\s*(?:;|$)/;
const FOCUS_REPLACEMENT = /(?:^|;)\s*(?:box-shadow|border-color):[^;]*var\(--border-focus\)/;

test('has a global focus-visible ring', () => {
  const rule = blocks.find((block) => block.selector === ':focus-visible');
  assert.ok(rule, ':focus-visible rule is missing from index.css');
  assert.match(rule.body, FOCUS_RING, ':focus-visible must set outline: 2px solid var(--border-focus)');
  assert.match(rule.body, FOCUS_OFFSET, ':focus-visible must set outline-offset: 2px');
});

test('no focus outline is removed without a replacement', () => {
  const removers = blocks.filter((block) => REMOVES_OUTLINE.test(block.body));
  assert.ok(removers.length > 0, 'expected at least one rule to be checked');
  const offenders = removers
    .filter((block) => !FOCUS_REPLACEMENT.test(block.body))
    .map((block) => block.selector);
  assert.deepEqual(offenders, [], `rules remove the focus outline without a var(--border-focus) replacement: ${offenders.join(', ')}`);
});

test('the editor marks focus with a 1px ring, not the 2px global one', () => {
  const rule = blocks.find((block) => block.selector === '.editor:focus-visible');
  assert.ok(rule, '.editor:focus-visible rule is missing from index.css');
  assert.match(rule.body, /(?:^|;)\s*outline:\s*none\s*(?:;|$)/, 'the editor keeps outline: none');
  assert.match(rule.body, /(?:^|;)\s*box-shadow:\s*0 0 0 1px var\(--border-focus\)\s*(?:;|$)/,
    'the editor ring is a 1px box-shadow in var(--border-focus)');
});

test('scene rows take the global focus ring instead of their own 1px outline', () => {
  const override = blocks.find((block) => block.selector.includes('.scene-row-main:focus-visible'));
  assert.equal(override, undefined, '.scene-row-main:focus-visible overrides the global ring; delete it');
});

test('no rule resets every property with all: unset, which would also drop the focus ring', () => {
  const resetters = blocks.filter((block) => /(?:^|;)\s*all:\s*unset\s*(?:;|$)/.test(block.body));
  assert.deepEqual(resetters.map((block) => block.selector), [], 'replace all: unset with the properties the element needs');
});

// Items that sit against the edge of a scroll container or the sidebar: a 2px ring drawn outside
// them is cut off there, so the ring is drawn inside for these
test('edge items draw their focus ring inside the element so the container does not clip it', () => {
  const rule = blocks.find((block) => block.selector.includes('.chapter-item:focus-visible'));
  assert.ok(rule, 'an edge-item focus rule is missing from index.css');
  for (const item of ['.sidebar-nav-item', '.chapter-item', '.panel-tab', '.chapter-block', '.codex-tab', '.content']) {
    assert.ok(rule.selector.includes(`${item}:focus-visible`), `${item}:focus-visible is not in the edge-item rule`);
  }
  assert.match(rule.body, /(?:^|;)\s*outline-offset:\s*-2px\s*(?:;|$)/, 'the edge-item rule sets outline-offset: -2px');
});
