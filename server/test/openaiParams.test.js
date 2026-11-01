import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { complete } from '../src/services/providers/openai.js';

const args = { apiKey: 'sk-1', model: 'gpt-x', system: 's', prompt: 'p', maxTokens: 50, temperature: 0.5 };
const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status });
const reply = (text) => ({ choices: [{ message: { content: text } }] });

let sent;
let behaviour;
beforeEach(() => {
  sent = [];
  mock.method(OpenAI.Chat.Completions.prototype, 'create', async (params) => {
    sent.push(params);
    return behaviour(params);
  });
});
afterEach(() => mock.restoreAll());

test('caps output with max_completion_tokens, which every current model accepts', async () => {
  behaviour = () => reply('ok');
  assert.equal(await complete(args), 'ok');
  assert.equal(sent[0].max_completion_tokens, 50);
  assert.equal('max_tokens' in sent[0], false);
});

test('retries once without temperature when the model only allows its default', async () => {
  behaviour = (params) => {
    if (params.temperature !== undefined) {
      throw apiError(400, "Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.");
    }
    return reply('ok');
  };
  assert.equal(await complete(args), 'ok');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].temperature, undefined);
});

test('does not retry other 400 errors', async () => {
  behaviour = () => {
    throw apiError(400, 'model not found');
  };
  await assert.rejects(complete(args), /not found/);
  assert.equal(sent.length, 1);
});
