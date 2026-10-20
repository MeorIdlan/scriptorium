import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyProps, guardBusy } from '../src/utils/busyButton.js';

// A busy button stays focusable (aria-disabled, not disabled), so its handler
// must not run while the request is in flight
test('busyProps marks a busy button aria-disabled and data-busy', () => {
  assert.deepEqual(busyProps(true), { 'aria-disabled': 'true', 'data-busy': '' });
});

test('busyProps leaves an idle button without the markers', () => {
  const props = busyProps(false);
  assert.equal(props['aria-disabled'], undefined);
  assert.equal(props['data-busy'], undefined);
});

test('guardBusy passes the event to the handler when not busy', () => {
  const calls = [];
  const handler = guardBusy(false, (e) => calls.push(e));
  handler('event');
  assert.deepEqual(calls, ['event']);
});

test('guardBusy skips the handler and prevents the default while busy', () => {
  const calls = [];
  let prevented = false;
  const handler = guardBusy(true, (e) => calls.push(e));
  handler({ preventDefault: () => { prevented = true; } });
  assert.deepEqual(calls, []);
  assert.equal(prevented, true);
});
