import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { complete } from '../src/services/providers/anthropic.js';

const args = { apiKey: 'sk-1', model: 'claude-x', system: 's', prompt: 'p', maxTokens: 50, temperature: 0.5 };
const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status });

let sent;
let behaviour;
beforeEach(() => {
  sent = [];
  mock.method(Anthropic.Messages.prototype, 'create', async (params) => {
    sent.push(params);
    return behaviour(params);
  });
});
afterEach(() => mock.restoreAll());

test('sends temperature to a model that accepts it, once', async () => {
  behaviour = () => ({ content: [{ text: 'ok' }] });
  assert.equal(await complete(args), 'ok');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].temperature, 0.5);
});

test('retries once without temperature when the model rejects it', async () => {
  behaviour = (params) => {
    if ('temperature' in params && params.temperature !== undefined) {
      throw apiError(400, '`temperature` is deprecated for this model.');
    }
    return { content: [{ text: 'ok' }] };
  };
  assert.equal(await complete(args), 'ok');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].temperature, undefined);
});

test('does not retry other 400 errors', async () => {
  behaviour = () => {
    throw apiError(400, 'model: not found');
  };
  await assert.rejects(complete(args), /not found/);
  assert.equal(sent.length, 1);
});

test('reads the text blocks even when a thinking block comes first', async () => {
  behaviour = () => ({
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }],
  });
  assert.equal(await complete(args), 'Hello there');
});

test('returns an empty string when the reply has no text block', async () => {
  behaviour = () => ({ content: [{ type: 'thinking', thinking: '' }] });
  assert.equal(await complete(args), '');
});
