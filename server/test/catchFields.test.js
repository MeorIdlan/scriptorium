import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CATCH_LENGTH,
  CATCH_STATUSES,
  USED_AS_KINDS,
  newCatchId,
  catchContent,
  catchTag,
  catchUpdate,
} from '../src/services/catchFields.js';

test('newCatchId has the catch_<ms>_<8hex> shape and is unique', () => {
  const a = newCatchId();
  const b = newCatchId();
  assert.match(a, /^catch_\d{13}_[0-9a-f]{8}$/);
  assert.notEqual(a, b);
});

test('constants match the spec', () => {
  assert.equal(MAX_CATCH_LENGTH, 2000);
  assert.deepEqual(CATCH_STATUSES, ['open', 'used', 'discarded']);
  assert.deepEqual(USED_AS_KINDS, ['insert', 'codex-character', 'codex-place', 'codex-rule', 'map-note']);
});

test('catchContent trims and enforces 1..2000 characters', () => {
  assert.deepEqual(catchContent('  idea  '), { ok: true, value: 'idea' });
  assert.equal(catchContent('x'.repeat(2000)).ok, true);
  assert.equal(catchContent('   ').ok, false);
  assert.equal(catchContent('x'.repeat(2001)).ok, false);
  assert.equal(catchContent(42).ok, false);
  assert.equal(catchContent(undefined).field, 'content');
});

test('catchTag accepts a short string, and treats null/empty/undefined as null', () => {
  assert.deepEqual(catchTag('ch_1'), { ok: true, value: 'ch_1' });
  assert.deepEqual(catchTag(null), { ok: true, value: null });
  assert.deepEqual(catchTag(''), { ok: true, value: null });
  assert.deepEqual(catchTag(undefined), { ok: true, value: null });
  assert.equal(catchTag(7).ok, false);
  assert.equal(catchTag({ $ne: null }).ok, false);
  assert.equal(catchTag('x'.repeat(101)).field, 'taggedChapterId');
});

test('catchUpdate keeps only whitelisted fields', () => {
  const r = catchUpdate({ content: ' new ', workId: 'w_other', createdAt: 'x', _id: 'y', id: 'z', extra: 1 });
  assert.deepEqual(r, { ok: true, set: { content: 'new' } });
});

test('catchUpdate validates only the fields present (status-only update on a long legacy catch)', () => {
  assert.deepEqual(catchUpdate({ status: 'discarded' }), { ok: true, set: { status: 'discarded' } });
  assert.deepEqual(catchUpdate({}), { ok: true, set: {} });
  assert.deepEqual(catchUpdate(null), { ok: true, set: {} });
});

test('catchUpdate rejects bad values with the field name', () => {
  assert.equal(catchUpdate({ content: '' }).field, 'content');
  assert.equal(catchUpdate({ status: 'archived' }).field, 'status');
  assert.equal(catchUpdate({ taggedChapterId: 5 }).field, 'taggedChapterId');
  assert.equal(catchUpdate({ usedAs: 'codex' }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'nope', refId: 'a', label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: '', label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: 'x'.repeat(101), label: 'b' } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: { kind: 'insert', refId: 'a', label: 'x'.repeat(121) } }).field, 'usedAs');
  assert.equal(catchUpdate({ usedAs: [] }).field, 'usedAs');
});

test('catchUpdate keeps a valid usedAs and drops its extra keys', () => {
  const r = catchUpdate({
    status: 'used',
    usedAs: { kind: 'codex-character', refId: 'char_1', label: 'Mara', evil: true },
  });
  assert.deepEqual(r, {
    ok: true,
    set: { status: 'used', usedAs: { kind: 'codex-character', refId: 'char_1', label: 'Mara' } },
  });
});

test('catchUpdate normalises an empty tag to null', () => {
  assert.deepEqual(catchUpdate({ taggedChapterId: '' }), { ok: true, set: { taggedChapterId: null } });
});

test('reopening always clears usedAs, whatever the body says', () => {
  assert.deepEqual(catchUpdate({ status: 'open' }), { ok: true, set: { status: 'open', usedAs: null } });
  assert.deepEqual(
    catchUpdate({ status: 'open', usedAs: { kind: 'insert', refId: 'c', label: 'Ch. 1' } }),
    { ok: true, set: { status: 'open', usedAs: null } }
  );
});

test('usedAs can be cleared explicitly', () => {
  assert.deepEqual(catchUpdate({ usedAs: null }), { ok: true, set: { usedAs: null } });
});
