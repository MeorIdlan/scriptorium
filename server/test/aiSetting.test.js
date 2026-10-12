import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAiEnabled, isAiAvailable, maskSettings } from '../src/services/settingsService.js';

const settings = ({ anthropicKey = '', openaiKey = '', active = 'anthropic', aiEnabled } = {}) => ({
  activeProvider: active,
  providers: {
    anthropic: { apiKey: anthropicKey, model: 'm' },
    openai: { apiKey: openaiKey, model: 'm' },
  },
  ...(aiEnabled === undefined ? {} : { aiEnabled }),
});

test('a writer with no key has AI off and unavailable', () => {
  const s = settings();
  assert.equal(isAiAvailable(s), false);
  assert.equal(isAiEnabled(s), false);
});

test('a writer who never chose has AI on once a key is saved', () => {
  assert.equal(isAiEnabled(settings({ anthropicKey: 'sk-1' })), true);
});

test('turning AI off sticks, even after a key is saved again', () => {
  assert.equal(isAiEnabled(settings({ anthropicKey: 'sk-2', aiEnabled: false })), false);
});

test('AI turned on reads as off when the active provider has no key', () => {
  const s = settings({ anthropicKey: 'sk-1', active: 'openai', aiEnabled: true });
  assert.equal(isAiAvailable(s), false);
  assert.equal(isAiEnabled(s), false);
});

test('a stored true with a key is on', () => {
  assert.equal(isAiEnabled(settings({ openaiKey: 'sk-o', active: 'openai', aiEnabled: true })), true);
});

test('masked settings report the effective AI state and availability', () => {
  const masked = maskSettings(settings({ anthropicKey: 'sk-ant-1234567890', aiEnabled: false }));
  assert.equal(masked.aiEnabled, false);
  assert.equal(masked.aiAvailable, true);
  assert.equal(masked.providers.anthropic.apiKey, undefined);
});

test('an existing user with a key and no stored choice keeps AI on', () => {
  // The shape stored before this change: no aiEnabled field at all
  const stored = { activeProvider: 'anthropic', providers: { anthropic: { apiKey: 'sk-old', model: 'm' } } };
  const masked = maskSettings(stored);
  assert.equal(masked.aiEnabled, true);
  assert.equal(masked.aiAvailable, true);
});

test('masked settings for a writer with no key report AI off and unavailable', () => {
  const masked = maskSettings(settings({ aiEnabled: true }));
  assert.equal(masked.aiEnabled, false);
  assert.equal(masked.aiAvailable, false);
});
