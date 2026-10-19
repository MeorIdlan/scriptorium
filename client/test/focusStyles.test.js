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
