import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_WORDS,
  validateTargets,
  targetWords,
  maxTokensFor,
  buildPolishPrompt,
  parseRewrites,
} from '../src/services/polishService.js';

test('validateTargets accepts well-formed targets', () => {
  assert.equal(validateTargets([{ id: 't1', text: 'One.' }, { id: 't2', text: 'Two.' }]), null);
});

test('validateTargets rejects empty, malformed and duplicate targets', () => {
  for (const bad of [undefined, [], [{ id: 't1', text: '  ' }], [{ id: 't1' }], [{ id: 'bad id', text: 'x' }], [{ id: 't1', text: 'a' }, { id: 't1', text: 'b' }]]) {
    assert.equal(validateTargets(bad)?.code, 'MISSING_FIELD', JSON.stringify(bad));
  }
});

test('validateTargets rejects more than MAX_TARGET_WORDS words', () => {
  const text = Array.from({ length: MAX_TARGET_WORDS + 1 }, () => 'word').join(' ');
  assert.equal(validateTargets([{ id: 't1', text }]).code, 'TOO_LONG');
  assert.equal(validateTargets([{ id: 't1', text: text.split(' ').slice(1).join(' ') }]), null);
});

test('targetWords and maxTokensFor size the output cap', () => {
  assert.equal(targetWords([{ text: 'a b c' }, { text: 'd' }]), 4);
  assert.equal(maxTokensFor(100), 420);
  assert.equal(maxTokensFor(2000), 4600);
  assert.equal(maxTokensFor(10000), 8000);
});

test('buildPolishPrompt marks each target and wraps the chapter', () => {
  const prompt = buildPolishPrompt({
    chapterText: 'Full chapter text.',
    targets: [{ id: 't1', text: 'First passage.' }, { id: 't2', text: 'Second.' }],
  });
  assert.ok(prompt.includes('<chapter>\nFull chapter text.\n</chapter>'));
  assert.ok(prompt.includes('Passages to polish:\n[[t1]]First passage.[[/t1]]\n[[t2]]Second.[[/t2]]'));
  assert.ok(prompt.includes('Rewrite ONLY the passages marked'));
});

test('buildPolishPrompt middle-truncates very long chapters', () => {
  const chapterText = 'A'.repeat(40000) + 'MIDDLE' + 'Z'.repeat(40000);
  const prompt = buildPolishPrompt({ chapterText, targets: [{ id: 't1', text: 'x' }] });
  assert.ok(!prompt.includes('MIDDLE'));
  assert.ok(prompt.includes('[…]'));
});

test('parseRewrites extracts marked passages, keeping inner newlines', () => {
  const raw = 'Sure.\n[[t1]]\nOne, better.\n[[/t1]]\n[[t2]]Line one.\nLine two.[[/t2]]';
  assert.deepEqual(parseRewrites(raw, ['t1', 't2']), {
    rewrites: [
      { id: 't1', text: 'One, better.' },
      { id: 't2', text: 'Line one.\nLine two.' },
    ],
    missing: [],
  });
});

test('parseRewrites reports missing, empty and duplicated passages as missing', () => {
  const raw = '[[t1]]  [[/t1]] [[t2]]a[[/t2]] [[t2]]b[[/t2]] [[t9]]stray[[/t9]] text outside';
  assert.deepEqual(parseRewrites(raw, ['t1', 't2', 't3']), {
    rewrites: [],
    missing: ['t1', 't2', 't3'],
  });
  assert.deepEqual(parseRewrites(undefined, ['t1']), { rewrites: [], missing: ['t1'] });
});

test('maxTokensFor budgets for marker overhead per target', () => {
  assert.equal(maxTokensFor(100, 0), 420);
  assert.equal(maxTokensFor(1500, 60), 3500 + 960);
  assert.equal(maxTokensFor(2000, 250), 8000);
});
