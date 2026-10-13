import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserTimeZone, pendingGain, progressView, parseGoalInput } from '../src/utils/dailyProgress.js';

test('the browser timezone is a non-empty IANA name', () => {
  assert.equal(typeof browserTimeZone(), 'string');
  assert.ok(browserTimeZone().length > 0);
});

test('pending gain is the unsaved increase, never negative (A2)', () => {
  assert.equal(pendingGain(10, 7), 3);
  assert.equal(pendingGain(7, 10), 0);
});

test('the view adds the pending gain to the saved total as the writer types (A2)', () => {
  assert.deepEqual(progressView({ words: 1000, goal: 1000, pendingGain: 240 }), {
    total: 1240,
    goal: 1000,
    percent: 100,
    text: 'Today 1,240 / 1,000 words',
  });
});

test("with no goal the view shows today's count only", () => {
  assert.deepEqual(progressView({ words: 200, goal: null, pendingGain: 0 }), {
    total: 200,
    goal: null,
    percent: null,
    text: 'Today 200 words',
  });
});

test('a failed fetch hides the daily part', () => {
  assert.equal(progressView({ words: null, goal: null, pendingGain: 5 }), null);
});

test('goal input: blank clears, whole numbers pass, everything else is refused (A1)', () => {
  assert.deepEqual(parseGoalInput(''), { ok: true, goal: null });
  assert.deepEqual(parseGoalInput(' 500 '), { ok: true, goal: 500 });
  for (const bad of ['0', '2.5', 'abc', '100001', '-3']) {
    assert.equal(parseGoalInput(bad).ok, false, `${bad} should be refused`);
  }
});
