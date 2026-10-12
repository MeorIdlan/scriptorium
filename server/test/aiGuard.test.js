import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAiEnabled } from '../src/services/settingsService.js';
import { requireAiEnabled } from '../src/middleware/requireAiEnabled.js';

const withKey = { activeProvider: 'anthropic', providers: { anthropic: { apiKey: 'sk-1' } } };
const noKey = { activeProvider: 'anthropic', providers: { anthropic: { apiKey: '' } } };

test('assertAiEnabled lets a writer with AI on through', () => {
  assert.doesNotThrow(() => assertAiEnabled(withKey));
});

test('assertAiEnabled refuses a writer who turned AI off with 403 AI_DISABLED', () => {
  assert.throws(() => assertAiEnabled({ ...withKey, aiEnabled: false }), { status: 403, code: 'AI_DISABLED' });
});

test('assertAiEnabled refuses a writer with no key with 400 NO_API_KEY', () => {
  assert.throws(() => assertAiEnabled(noKey), { status: 400, code: 'NO_API_KEY' });
});

const run = (middleware, req) =>
  new Promise((resolve) => middleware(req, {}, (err) => resolve(err)));

test('requireAiEnabled refuses before the route runs when AI is off', async () => {
  const loaded = [];
  const mw = requireAiEnabled(async (userId) => {
    loaded.push(userId);
    return { ...withKey, aiEnabled: false };
  });
  const err = await run(mw, { user: { id: 'user_1' } });
  assert.deepEqual(loaded, ['user_1']);
  assert.equal(err.code, 'AI_DISABLED');
});

test('requireAiEnabled calls next with no error when AI is on', async () => {
  const mw = requireAiEnabled(async () => withKey);
  assert.equal(await run(mw, { user: { id: 'user_1' } }), undefined);
});
