import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiSwitchState } from '../src/utils/aiSwitch.js';

test('with no key the switch is off, disabled, and says to save a key', () => {
  assert.deepEqual(aiSwitchState({ aiEnabled: false, aiAvailable: false }), {
    checked: false,
    busy: false,
    disabled: true,
    hint: 'Save an API key to turn on AI features.',
  });
});

test('with a key the switch shows the saved state and can be flipped', () => {
  assert.deepEqual(aiSwitchState({ aiEnabled: true, aiAvailable: true }), {
    checked: true,
    busy: false,
    disabled: false,
    hint: null,
  });
  assert.equal(aiSwitchState({ aiEnabled: false, aiAvailable: true }).checked, false);
});

test('the switch is busy, not disabled, while a change is saving', () => {
  const state = aiSwitchState({ aiEnabled: true, aiAvailable: true }, { saving: true });
  assert.equal(state.busy, true);
  assert.equal(state.disabled, false);
});

test('settings not loaded yet read as off and disabled', () => {
  const state = aiSwitchState(null);
  assert.equal(state.checked, false);
  assert.equal(state.disabled, true);
});
