import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import Settings from '../src/models/Settings.js';
import Chapter from '../src/models/Chapter.js';
import { complete } from '../src/services/llmService.js';
import { generateSummary, ensureSummaries } from '../src/services/summaryService.js';

const withKey = { activeProvider: 'anthropic', providers: { anthropic: { apiKey: 'sk-1', model: 'claude-x' } } };
const work = { _id: 'work_1', ownerId: 'user_1', title: 'Bells' };
const chapter = (id) => ({ _id: id, number: 1, title: id, content: `Text of ${id}.` });

// Every provider call goes through the SDK's messages.create; record them
let providerCalls;
let stored;
beforeEach(() => {
  providerCalls = 0;
  mock.method(Anthropic.Messages.prototype, 'create', async () => {
    providerCalls += 1;
    return { content: [{ text: 'A short summary.' }] };
  });
  mock.method(Settings, 'findById', () => ({ lean: async () => stored }));
  mock.method(Chapter, 'updateOne', async () => ({}));
});
afterEach(() => mock.restoreAll());

test('with AI off, complete() refuses and never reaches the provider', async () => {
  stored = { ...withKey, aiEnabled: false };
  await assert.rejects(complete({ prompt: 'hi', userId: 'user_1' }), { status: 403, code: 'AI_DISABLED' });
  assert.equal(providerCalls, 0);
});

test('with AI off, regenerating a chapter summary never reaches the provider', async () => {
  stored = { ...withKey, aiEnabled: false };
  await assert.rejects(generateSummary(work, chapter('c1'), { force: true }), { code: 'AI_DISABLED' });
  assert.equal(providerCalls, 0);
  assert.equal(Chapter.updateOne.mock.callCount(), 0);
});

test('with AI off, automatic summaries stop without reaching the provider', async () => {
  stored = { ...withKey, aiEnabled: false };
  await assert.rejects(ensureSummaries(work, [chapter('c2'), chapter('c3'), chapter('c4')]), { code: 'AI_DISABLED' });
  assert.equal(providerCalls, 0);
});

test('with AI on, the same summary call does reach the provider', async () => {
  stored = withKey;
  assert.equal(await generateSummary(work, chapter('c5'), { force: true }), 'A short summary.');
  assert.equal(providerCalls, 1);
});
