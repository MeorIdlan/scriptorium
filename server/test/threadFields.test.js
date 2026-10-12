import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  threadCreate,
  threadUpdate,
  newThreadId,
  defaultThreadColor,
  THREAD_PALETTE,
} from '../src/services/threadFields.js';

test('newThreadId shape', () => {
  assert.match(newThreadId(1700000000000), /^thr_1700000000000_[0-9a-f]{6}$/);
});

test('default colours cycle through the palette', () => {
  assert.equal(THREAD_PALETTE.length, 8);
  assert.equal(defaultThreadColor(0), '#c9a96e');
  assert.equal(defaultThreadColor(1), '#7fa7d9');
  assert.equal(defaultThreadColor(8), '#c9a96e');
});

test('create needs a name', () => {
  for (const body of [{}, { name: '' }, { name: '   ' }, null]) {
    const r = threadCreate(body);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_FIELD');
  }
});

test('create trims and returns only given fields', () => {
  assert.deepEqual(threadCreate({ name: '  The heir  ' }), { ok: true, value: { name: 'The heir' } });
  assert.deepEqual(threadCreate({ name: 'A', color: '#AABBCC', description: ' d ', status: 'resolved' }), {
    ok: true,
    value: { name: 'A', color: '#aabbcc', description: 'd', status: 'resolved' },
  });
});

test('bad values are refused with the field named', () => {
  const cases = [
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ name: 42 }, 'name'],
    [{ color: 'red' }, 'color'],
    [{ color: '#abc' }, 'color'],
    [{ description: 'x'.repeat(1001) }, 'description'],
    [{ description: 5 }, 'description'],
    [{ status: 'closed' }, 'status'],
    [{ order: 2 }, 'order'],
    [{ workId: 'work_b' }, 'workId'],
  ];
  for (const [body, field] of cases) {
    const r = threadUpdate(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.field, field);
    assert.equal(r.code, 'INVALID_FIELD');
  }
});

test('an 80-character name and a 1000-character description are allowed', () => {
  assert.equal(threadUpdate({ name: 'x'.repeat(80), description: 'y'.repeat(1000) }).ok, true);
});

test('update with no fields sets nothing', () => {
  assert.deepEqual(threadUpdate({}), { ok: true, set: {} });
});
