import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThreadIds, knownThreadIds, stripThreadFromHtml, MAX_TAGS } from '../src/services/threadTags.js';
import { sanitizeChapterHtml } from '../src/services/htmlService.js';
import { parseScenes, sceneSummaries } from '../src/services/sceneMarkers.js';

test('parseThreadIds keeps well-formed ids once, in order', () => {
  assert.deepEqual(parseThreadIds(' thr_1_aa  thr_2_bb thr_1_aa '), ['thr_1_aa', 'thr_2_bb']);
});

test('parseThreadIds drops anything that is not a thread id', () => {
  assert.deepEqual(parseThreadIds('thr_1 javascript:alert(1) "><x scn_1 thr_ thr_2-x'), ['thr_1']);
  assert.deepEqual(parseThreadIds(undefined), []);
  assert.deepEqual(parseThreadIds(['thr_1']), []);
});

test('parseThreadIds keeps at most MAX_TAGS ids', () => {
  const many = Array.from({ length: 80 }, (_, i) => `thr_${i}`).join(' ');
  assert.equal(parseThreadIds(many).length, MAX_TAGS);
});

test('knownThreadIds keeps only current threads', () => {
  assert.deepEqual(knownThreadIds(['thr_a', 'thr_gone', 'thr_b'], new Set(['thr_a', 'thr_b'])), ['thr_a', 'thr_b']);
  assert.deepEqual(knownThreadIds(undefined, new Set()), []);
});

test('stripThreadFromHtml removes the id from every marker and drops an emptied attribute', () => {
  const html =
    '<hr data-scene="scn_1" data-threads="thr_a thr_b" data-status="draft" /><div>One.</div>' +
    '<hr data-scene="scn_2" data-threads="thr_a" data-status="draft" /><div>Two.</div>';
  assert.equal(
    stripThreadFromHtml(html, 'thr_a'),
    '<hr data-scene="scn_1" data-threads="thr_b" data-status="draft" /><div>One.</div>' +
      '<hr data-scene="scn_2" data-status="draft" /><div>Two.</div>'
  );
});

test('stripThreadFromHtml only removes the exact id', () => {
  const html = '<hr data-scene="scn_1" data-threads="thr_1_abc thr_1_abcdef" data-status="draft" />';
  assert.equal(
    stripThreadFromHtml(html, 'thr_1_abc'),
    '<hr data-scene="scn_1" data-threads="thr_1_abcdef" data-status="draft" />'
  );
});

test('stripThreadFromHtml leaves html without the id unchanged', () => {
  const html = '<div data-threads="thr_a">text thr_a</div><hr data-scene="scn_1" data-status="draft" />';
  assert.equal(stripThreadFromHtml(html, 'thr_a'), html);
});

test('the sanitiser keeps data-threads on scene markers, cleaned', () => {
  const out = sanitizeChapterHtml('<hr data-scene="scn_a" data-threads="thr_1_aa bogus&quot;x thr_1_aa thr_2_bb"><div>A.</div>');
  assert.match(out, /<hr data-scene="scn_a" data-threads="thr_1_aa thr_2_bb" data-status="draft" \/>/);
});

test('the sanitiser drops data-threads when no id survives, and on other tags', () => {
  assert.doesNotMatch(sanitizeChapterHtml('<hr data-scene="scn_a" data-threads="nope javascript:x">'), /data-threads/);
  assert.doesNotMatch(sanitizeChapterHtml('<p data-threads="thr_1_aa">x</p>'), /data-threads/);
});

test('scenes expose their thread ids', () => {
  const html =
    '<hr data-scene="scn_a" data-threads="thr_1 thr_2" data-status="draft" /><div>A.</div>' +
    '<hr data-scene="scn_b" data-status="draft" /><div>B.</div>';
  assert.deepEqual(parseScenes(html).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
  assert.deepEqual(sceneSummaries(html).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
});
