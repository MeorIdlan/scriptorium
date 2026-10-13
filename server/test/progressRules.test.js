import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gainFor, dayKey } from '../src/services/wordCountService.js';

test('a save adds only the increase in words', () => {
  assert.equal(gainFor(100, 130), 30);
});

test('deleting or moving text adds nothing (A4)', () => {
  assert.equal(gainFor(130, 100), 0);
  assert.equal(gainFor(130, 130), 0);
});

test('the day flips at local midnight in the writer zone (A3)', () => {
  // Kuala Lumpur is UTC+8: 23:59 on 14 Oct, then 00:01 on 15 Oct
  assert.equal(dayKey(new Date('2026-10-14T15:59:00Z'), 'Asia/Kuala_Lumpur'), '2026-10-14');
  assert.equal(dayKey(new Date('2026-10-14T16:01:00Z'), 'Asia/Kuala_Lumpur'), '2026-10-15');
});

test('a zone with a non-hour offset rolls over at its own midnight (review focus 5)', () => {
  // Kathmandu is UTC+05:45: 23:59 on 14 Oct, then 00:01 on 15 Oct
  assert.equal(dayKey(new Date('2026-10-14T18:14:00Z'), 'Asia/Kathmandu'), '2026-10-14');
  assert.equal(dayKey(new Date('2026-10-14T18:16:00Z'), 'Asia/Kathmandu'), '2026-10-15');
});

test('an unknown zone throws a RangeError so callers can fall back', () => {
  assert.throws(() => dayKey(new Date(), 'Mars/Olympus'), RangeError);
});
