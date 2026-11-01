// Removing a saved provider key (card idKTLt3J): an explicit DELETE, never an
// empty field on save. HTTP tests against the in-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Settings from '../src/models/Settings.js';

const app = buildApp();
let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});

const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const keyPath = (id) => `/api/settings/providers/${id}/key`;

async function seed(fields = {}, user = 'user_a') {
  await Settings.create({
    _id: user,
    activeProvider: 'anthropic',
    providers: {
      anthropic: { apiKey: 'sk-ant-1234567890abcdef', model: 'claude-sonnet-4-6' },
      openai: { apiKey: 'sk-openai-1234567890abcdef', model: 'gpt-4o' },
    },
    ...fields,
  });
}

const stored = (user = 'user_a') => Settings.findById(user).lean();

test('removing a key clears it: hasKey is false and the preview is gone', async () => {
  await seed();
  const res = await call('delete', keyPath('anthropic'));
  assert.equal(res.status, 200);
  assert.equal(res.body.providers.anthropic.hasKey, false);
  assert.equal(res.body.providers.anthropic.keyPreview, null);
  assert.equal(res.body.providers.anthropic.apiKey, undefined);
  // The same on a fresh read, and in the stored document
  const read = await call('get', '/api/settings');
  assert.equal(read.body.providers.anthropic.hasKey, false);
  assert.equal((await stored()).providers.anthropic.apiKey, '');
  // The model choice stays
  assert.equal(read.body.providers.anthropic.model, 'claude-sonnet-4-6');
});

test('removing a key leaves no piece of it in the stored document', async () => {
  // Save Settings round-trips the masked fields, so a stored provider can carry
  // the key's first and last characters as keyPreview, and a stale hasKey
  await seed({
    providers: {
      anthropic: {
        apiKey: 'sk-ant-1234567890abcdef',
        keyPreview: 'sk-ant-1…cdef',
        hasKey: true,
        model: 'claude-sonnet-4-6',
      },
      openai: { apiKey: '', model: 'gpt-4o' },
    },
  });
  await call('delete', keyPath('anthropic'));
  const provider = (await stored()).providers.anthropic;
  assert.equal(provider.apiKey, '');
  assert.equal('keyPreview' in provider, false);
  assert.equal('hasKey' in provider, false);
  assert.equal(provider.model, 'claude-sonnet-4-6');
  assert.doesNotMatch(JSON.stringify(await stored()), /sk-ant-1/);
});

test('saving a blank or whitespace key does not remove the saved key', async () => {
  await seed();
  for (const apiKey of ['', '   ']) {
    const res = await call('put', '/api/settings').send({ providers: { anthropic: { apiKey } } });
    assert.equal(res.status, 200);
    assert.equal(res.body.providers.anthropic.hasKey, true);
  }
  assert.equal((await stored()).providers.anthropic.apiKey, 'sk-ant-1234567890abcdef');
});

test('removing the active provider key turns AI off and leaves the stored flag alone', async () => {
  await seed({ aiEnabled: true });
  const res = await call('delete', keyPath('anthropic'));
  assert.equal(res.body.aiAvailable, false);
  assert.equal(res.body.aiEnabled, false);
  assert.equal((await stored()).aiEnabled, true);
});

test('saving a new key after removal brings AI back on', async () => {
  await seed({ aiEnabled: true });
  await call('delete', keyPath('anthropic'));
  const res = await call('put', '/api/settings').send({ providers: { anthropic: { apiKey: 'sk-ant-new-key-123456' } } });
  assert.equal(res.body.providers.anthropic.hasKey, true);
  assert.equal(res.body.aiEnabled, true);
});

test('removing a provider that an older document never stored still works', async () => {
  await Settings.create({ _id: 'user_a', providers: { anthropic: { apiKey: 'sk-ant-1234567890abcdef', model: 'm' } } });
  const res = await call('delete', keyPath('openai'));
  assert.equal(res.status, 200);
  assert.equal(res.body.providers.openai.hasKey, false);
  assert.equal(res.body.providers.anthropic.hasKey, true);
});

test('removing another provider key leaves the active key and AI on', async () => {
  await seed({ aiEnabled: true });
  const res = await call('delete', keyPath('openai'));
  assert.equal(res.body.providers.openai.hasKey, false);
  assert.equal(res.body.providers.anthropic.hasKey, true);
  assert.equal(res.body.aiAvailable, true);
  assert.equal(res.body.aiEnabled, true);
});

test('an unknown provider is a 404 and nothing is written', async () => {
  await seed();
  const before = await stored();
  for (const id of ['nope', 'constructor', '__proto__', 'a.b']) {
    const res = await call('delete', keyPath(id));
    assert.equal(res.status, 404, id);
    assert.equal(res.body.code, 'UNKNOWN_PROVIDER', id);
  }
  assert.deepEqual(await stored(), before);
});

test('removing a key that is already gone, or with no settings document, is a harmless 200', async () => {
  const none = await call('delete', keyPath('anthropic'));
  assert.equal(none.status, 200);
  assert.equal(none.body.providers.anthropic.hasKey, false);
  assert.equal(await Settings.countDocuments({}), 0);

  await seed({ providers: { anthropic: { apiKey: '', model: 'm' }, openai: { apiKey: '', model: 'm' } } });
  const again = await call('delete', keyPath('anthropic'));
  assert.equal(again.status, 200);
  assert.equal(again.body.providers.anthropic.hasKey, false);
});

test("one writer's removal does not touch another writer's key", async () => {
  await seed({}, 'user_a');
  await seed({}, 'user_b');
  await call('delete', keyPath('anthropic'), 'user_a');
  assert.equal((await stored('user_a')).providers.anthropic.apiKey, '');
  assert.equal((await stored('user_b')).providers.anthropic.apiKey, 'sk-ant-1234567890abcdef');
});
