import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sceneList, markerHtml, applyCard } from '../src/utils/scenes.js';
import {
  parseThreadIds,
  threadTagCount,
  deleteMessage,
  threadNameError,
  threadDescriptionError,
  tagList,
  toggleTag,
  setChapterThreads,
} from '../src/utils/threads.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

test('scenes read their thread ids from the marker', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1 thr_2" data-status="draft"><div>A.</div><hr data-scene="scn_b" data-status="draft"><div>B.</div>');
  assert.deepEqual(sceneList(root).map((s) => s.threadIds), [['thr_1', 'thr_2'], []]);
});

test('markerHtml writes thread ids only when there are some', () => {
  assert.match(markerHtml({ id: 'scn_a', threadIds: ['thr_1', 'thr_2'] }), /data-threads="thr_1 thr_2"/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: [] }), /data-threads/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a' }), /data-threads/);
});

test('editing a scene card keeps its thread tags', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  applyCard(marker, { title: 'New title', pov: '', location: '', status: 'revise', summary: '' });
  assert.equal(marker.getAttribute('data-threads'), 'thr_1');
  assert.equal(marker.getAttribute('data-title'), 'New title');
});

test('applyCard sets or clears tags when threadIds is given', () => {
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  applyCard(marker, { status: 'draft', threadIds: ['thr_2', 'bad id', 'thr_3'] });
  assert.equal(marker.getAttribute('data-threads'), 'thr_2 thr_3');
  applyCard(marker, { status: 'draft', threadIds: [] });
  assert.equal(marker.hasAttribute('data-threads'), false);
});

test('parseThreadIds matches the server rules', () => {
  assert.deepEqual(parseThreadIds(' thr_1  javascript:x thr_1 thr_2 '), ['thr_1', 'thr_2']);
  assert.deepEqual(parseThreadIds(null), []);
});

test('threadTagCount counts tagged chapters and scenes', () => {
  const chapters = [
    { id: 'c1', threadIds: ['thr_1'], scenes: [{ threadIds: ['thr_1'] }, { threadIds: [] }] },
    { id: 'c2', scenes: [{ threadIds: ['thr_1', 'thr_2'] }] },
    { id: 'c3' },
  ];
  assert.equal(threadTagCount(chapters, 'thr_1'), 3);
  assert.equal(threadTagCount(chapters, 'thr_9'), 0);
});

test('deleteMessage mentions tags only when there are some', () => {
  assert.equal(deleteMessage('Heir', 0), 'Delete "Heir"?');
  assert.equal(deleteMessage('Heir', 1), 'Delete "Heir"? It\'s tagged on 1 chapter or scene; the tag will be removed.');
  assert.equal(deleteMessage('Heir', 3), 'Delete "Heir"? It\'s tagged on 3 chapters and scenes; the tags will be removed.');
});

test('client field checks match the server limits', () => {
  assert.equal(threadNameError('  '), 'Name is required');
  assert.equal(threadNameError('x'.repeat(81)), 'Name must be at most 80 characters');
  assert.equal(threadNameError(' Heir '), null);
  assert.equal(threadDescriptionError('x'.repeat(1001)), 'Description must be at most 1000 characters');
  assert.equal(threadDescriptionError(''), null);
});

test('tagList accepts arrays only and keeps valid ids', () => {
  assert.deepEqual(tagList(['thr_1', 'bad id', 'thr_1', 'thr_2']), ['thr_1', 'thr_2']);
  for (const bad of [undefined, null, 'thr_1', { 0: 'thr_1' }, 7]) assert.deepEqual(tagList(bad), []);
});

test('toggleTag adds a missing id and removes a present one', () => {
  assert.deepEqual(toggleTag(['thr_1'], 'thr_2'), ['thr_1', 'thr_2']);
  assert.deepEqual(toggleTag(['thr_1', 'thr_2'], 'thr_1'), ['thr_2']);
  assert.deepEqual(toggleTag(undefined, 'thr_1'), ['thr_1']);
});

test('markerHtml and applyCard survive a threadIds that is not an array', () => {
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: 'thr_1' }), /data-threads/);
  assert.doesNotMatch(markerHtml({ id: 'scn_a', threadIds: { length: 1 } }), /data-threads/);
  const root = editor('<hr data-scene="scn_a" data-threads="thr_1" data-status="draft"><div>A.</div>');
  const marker = root.querySelector('hr');
  assert.doesNotThrow(() => applyCard(marker, { status: 'draft', threadIds: 'thr_2' }));
  assert.equal(marker.hasAttribute('data-threads'), false);
});

test('setChapterThreads puts the tag list on the chapter', async () => {
  const calls = [];
  const api = { put: async (path, body) => (calls.push([path, body]), { id: 'c1' }) };
  await setChapterThreads(api, 'w1', 'c1', ['thr_1']);
  assert.deepEqual(calls, [['/works/w1/chapters/c1/threads', { threadIds: ['thr_1'] }]]);
});
