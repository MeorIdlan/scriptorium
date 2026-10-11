import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultName,
  appendNote,
  markUsed,
  markDiscarded,
  reopen,
  useAsCodex,
  useAsMapNote,
  markUsedAfter,
} from '../src/utils/catchActions.js';

// Records calls; `fail` maps a method to a predicate on the path; `map` is what GET /map returns
function fakeApi({ fail = {}, map = { chapters: {} } } = {}) {
  const calls = [];
  const handler = (method) => async (path, body) => {
    calls.push([method, path, body]);
    if (fail[method]?.(path)) throw new Error(`${method} ${path} failed`);
    if (method === 'get') return map;
    if (method === 'post') return { ...body, id: 'new_1' };
    return { ok: true };
  };
  return { calls, api: { get: handler('get'), post: handler('post'), put: handler('put') } };
}
const item = { id: 'k1', content: 'Mara\nhas a scar' };

test('defaultName takes the first non-blank line, trimmed, up to 60 characters', () => {
  assert.equal(defaultName('\n  Mara the bell-ringer  \nmore'), 'Mara the bell-ringer');
  assert.equal(defaultName('x'.repeat(80)).length, 60);
  assert.equal(defaultName(''), '');
  assert.equal(defaultName(undefined), '');
});

test('appendNote adds a blank line only when notes already exist', () => {
  assert.equal(appendNote('', 'New'), 'New');
  assert.equal(appendNote(undefined, 'New'), 'New');
  assert.equal(appendNote(null, 'New'), 'New');
  assert.equal(appendNote('Old\n\n', 'New'), 'Old\n\nNew');
  assert.equal(appendNote('Old', 'New'), 'Old\n\nNew');
});

test('markUsed, markDiscarded and reopen PUT the status', async () => {
  const { api, calls } = fakeApi();
  await markUsed(api, 'w1', item);
  await markUsed(api, 'w1', item, { kind: 'insert', refId: 'c1', label: 'Ch. 1' });
  await markDiscarded(api, 'w1', item);
  await reopen(api, 'w1', item);
  assert.deepEqual(calls, [
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: null }],
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: 'insert', refId: 'c1', label: 'Ch. 1' } }],
    ['put', '/works/w1/catches/k1', { status: 'discarded' }],
    ['put', '/works/w1/catches/k1', { status: 'open' }],
  ]);
});

test('useAsCodex creates each entry type, then marks the catch used', async () => {
  for (const [type, path, body] of [
    ['character', '/works/w1/codex/characters', { name: 'Mara', notes: 'text' }],
    ['place', '/works/w1/codex/places', { name: 'Mara', notes: 'text' }],
    ['rule', '/works/w1/codex/rules', { rule: 'Mara', description: 'text' }],
  ]) {
    const { api, calls } = fakeApi();
    const r = await useAsCodex(api, 'w1', item, { type, name: '  Mara ', text: 'text' });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(calls, [
      ['post', path, body],
      ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: `codex-${type}`, refId: 'new_1', label: 'Mara' } }],
    ]);
  }
});

test('useAsCodex: a failed create changes nothing else', async () => {
  const { api, calls } = fakeApi({ fail: { post: () => true } });
  const r = await useAsCodex(api, 'w1', item, { type: 'place', name: 'Well', text: 't' });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'create');
  assert.ok(r.error instanceof Error);
  assert.equal(calls.length, 1);
});

test('useAsCodex: a failed mark reports stage mark', async () => {
  const { api } = fakeApi({ fail: { put: () => true } });
  const r = await useAsCodex(api, 'w1', item, { type: 'character', name: 'Mara', text: 't' });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'mark');
});

test('useAsCodex rejects a blank name or unknown type without calling the api', async () => {
  const { api, calls } = fakeApi();
  assert.equal((await useAsCodex(api, 'w1', item, { type: 'character', name: '  ', text: 't' })).stage, 'create');
  assert.equal((await useAsCodex(api, 'w1', item, { type: 'monster', name: 'X', text: 't' })).stage, 'create');
  assert.equal(calls.length, 0);
});

test('useAsCodex clips the usedAs label to 120 characters', async () => {
  const { api, calls } = fakeApi();
  await useAsCodex(api, 'w1', item, { type: 'rule', name: 'r'.repeat(200), text: 't' });
  assert.equal(calls[1][2].usedAs.label.length, 120);
});

test('useAsMapNote appends to existing notes after re-reading the map', async () => {
  const { api, calls } = fakeApi({ map: { chapters: { c1: { notes: 'Old note' } } } });
  const r = await useAsMapNote(api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1 — Arrival', text: 'New idea' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, [
    ['get', '/works/w1/map', undefined],
    ['put', '/works/w1/map/chapters/c1', { notes: 'Old note\n\nNew idea' }],
    ['put', '/works/w1/catches/k1', { status: 'used', usedAs: { kind: 'map-note', refId: 'c1', label: 'Ch. 1 — Arrival' } }],
  ]);
});

test('useAsMapNote on a chapter with no Map entry, or no Map at all', async () => {
  for (const map of [{ chapters: {} }, {}, null]) {
    const { api, calls } = fakeApi({ map });
    await useAsMapNote(api, 'w1', item, { chapterId: 'c9', chapterLabel: 'Ch. 9', text: 'Only' });
    assert.deepEqual(calls[1], ['put', '/works/w1/map/chapters/c9', { notes: 'Only' }]);
  }
});

test('useAsMapNote failure stages', async () => {
  let f = fakeApi({ fail: { get: () => true } });
  let r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'create');
  assert.equal(f.calls.length, 1);

  f = fakeApi({ fail: { put: (p) => p.includes('/map/') } });
  r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'create');
  assert.equal(f.calls.length, 2);

  f = fakeApi({ fail: { put: (p) => p.includes('/catches/') } });
  r = await useAsMapNote(f.api, 'w1', item, { chapterId: 'c1', chapterLabel: 'Ch. 1', text: 'x' });
  assert.equal(r.stage, 'mark');
});

test('markUsedAfter maps a failure to stage mark', async () => {
  assert.deepEqual(await markUsedAfter(fakeApi().api, 'w1', item, null), { ok: true });
  const r = await markUsedAfter(fakeApi({ fail: { put: () => true } }).api, 'w1', item, null);
  assert.equal(r.stage, 'mark');
});
