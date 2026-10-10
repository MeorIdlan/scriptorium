import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashContent,
  summaryStatus,
  needsGeneration,
  truncateMiddle,
  cleanSummary,
} from '../src/services/summaryText.js';

const content = 'The bell rang twice.';
const hash = hashContent(content);

test('hashContent is stable and treats missing text as empty', () => {
  assert.equal(hashContent(content), hash);
  assert.equal(hashContent(undefined), hashContent(''));
  assert.notEqual(hashContent('a'), hashContent('b'));
});

test('summaryStatus covers all five states', () => {
  assert.equal(summaryStatus({ content }), 'none');
  assert.equal(summaryStatus({ content, summary: { text: '' } }), 'none');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: hash } }), 'current');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: 'old' } }), 'outdated');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: hash, edited: true } }), 'edited');
  assert.equal(
    summaryStatus({ content, summary: { text: 'S', sourceHash: 'old', edited: true } }),
    'edited-outdated'
  );
});

test('needsGeneration skips empty chapters and edited summaries', () => {
  assert.equal(needsGeneration({ content: '   ' }), false);
  assert.equal(needsGeneration({ content }), true);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: 'old' } }), true);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: hash } }), false);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: 'old', edited: true } }), false);
});

test('truncateMiddle leaves short text alone and keeps head and tail of long text', () => {
  assert.equal(truncateMiddle('short', 100), 'short');
  assert.equal(truncateMiddle('', 100), '');
  const long = 'A'.repeat(500) + 'MIDDLE' + 'Z'.repeat(500);
  const out = truncateMiddle(long, 200);
  assert.ok(out.length <= 200);
  assert.ok(out.startsWith('AAAA'));
  assert.ok(out.endsWith('ZZZZ'));
  assert.ok(!out.includes('MIDDLE'));
  assert.ok(out.includes('[…]'));
});

test('cleanSummary strips preambles, labels and wrapping quotes', () => {
  assert.equal(cleanSummary('  Mara arrives.  '), 'Mara arrives.');
  assert.equal(cleanSummary("Here is a summary of the chapter:\n\nMara arrives."), 'Mara arrives.');
  assert.equal(cleanSummary("Here's the summary: Mara arrives."), 'Mara arrives.');
  assert.equal(cleanSummary('Summary: Mara arrives.'), 'Mara arrives.');
  assert.equal(cleanSummary('"Mara arrives."'), 'Mara arrives.');
  assert.equal(cleanSummary('   '), '');
  assert.equal(cleanSummary(undefined), '');
});

test('cleanSummary strips chatty lead-ins and label lines', () => {
  assert.equal(cleanSummary('Sure! Here is a summary of Chapter 1:\n\nMara arrives.'), 'Mara arrives.');
  assert.equal(cleanSummary('Here is the summary of Chapter 1: The Bell:\n\nMara arrives.'), 'Mara arrives.');
  assert.equal(cleanSummary('**Summary:** Mara arrives.'), 'Mara arrives.');
  assert.equal(cleanSummary('Certainly. Summary: Mara arrives.'), 'Mara arrives.');
});

test('cleanSummary keeps quotes that belong to dialogue', () => {
  const dialogue = '"Run," Mara says, and later Tomas whispers "I know."';
  assert.equal(cleanSummary(dialogue), dialogue);
  assert.equal(cleanSummary('“Mara arrives.”'), 'Mara arrives.');
});

test('cleanSummary keeps a first sentence that merely contains a colon', () => {
  const text = 'Mara learns one rule: bells bind oaths. She leaves.';
  assert.equal(cleanSummary(text), text);
});
