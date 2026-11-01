import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { complete } from '../src/services/providers/openai.js';
import { retryCap } from '../src/services/providers/reasoning.js';

const base = { apiKey: 'sk-1', system: 's', prompt: 'p', maxTokens: 50, temperature: 0.5 };
const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status });
const reply = (content, finish = 'stop') => ({ choices: [{ message: { content }, finish_reason: finish }] });

let sent;
let replies;
beforeEach(() => {
  sent = [];
  mock.method(OpenAI.Chat.Completions.prototype, 'create', async (params) => {
    sent.push(params);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  });
});
afterEach(() => mock.restoreAll());

test('first request carries the least-reasoning effort for each model that needs one, and no temperature', async () => {
  const expected = { 'gpt-5-mini': 'minimal', o3: 'low', 'gpt-6-luna': 'low' };
  for (const [model, effort] of Object.entries(expected)) {
    sent = [];
    replies = [reply('ok')];
    assert.equal(await complete({ ...base, model }), 'ok');
    assert.equal(sent[0].reasoning_effort, effort, model);
    assert.equal('temperature' in sent[0], false, model);
  }
});

test('A2: a cut-off reply with no text is retried once with a larger cap and returns the retried text', async () => {
  replies = [reply(null, 'length'), reply('ok')];
  assert.equal(await complete({ ...base, model: 'gpt-5-mini' }), 'ok');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].max_completion_tokens, retryCap(50));
});

test('text that was cut off is returned as is, without a retry', async () => {
  replies = [reply('partial', 'length')];
  assert.equal(await complete({ ...base, model: 'gpt-5-mini' }), 'partial');
  assert.equal(sent.length, 1);
});

test('A3: a 400 that rejects reasoning_effort is retried once without it', async () => {
  replies = [apiError(400, "Unsupported value: 'reasoning_effort' does not support 'low' with this model."), reply('ok')];
  assert.equal(await complete({ ...base, model: 'gpt-6-luna' }), 'ok');
  assert.equal(sent.length, 2);
  assert.equal('reasoning_effort' in sent[1], false);
});

test('A3: an unrelated 400 is not retried', async () => {
  replies = [apiError(400, 'model not found')];
  await assert.rejects(complete({ ...base, model: 'gpt-6-luna' }), /not found/);
  assert.equal(sent.length, 1);
});

test('A4: a second cut-off reply fails with an error that names the cause and suggests another model', async () => {
  replies = [reply(null, 'length'), reply('', 'length')];
  await assert.rejects(complete({ ...base, model: 'o3' }), (err) => {
    assert.equal(err.code, 'AI_OUTPUT_CUT_OFF');
    assert.equal(err.status, 502);
    assert.match(err.message, /another model/);
    return true;
  });
  assert.equal(sent.length, 2);
});

test('a cut-off empty reply at the 8000 ceiling fails at once, with no retry', async () => {
  replies = [reply(null, 'length')];
  await assert.rejects(complete({ ...base, model: 'o3', maxTokens: 8000 }), (err) => err.code === 'AI_OUTPUT_CUT_OFF');
  assert.equal(sent.length, 1);
});

test('A6: models that work today make one request and get no reasoning_effort', async () => {
  for (const model of ['gpt-4o', 'gpt-5.4-mini', 'gpt-x']) {
    sent = [];
    replies = [reply('ok')];
    assert.equal(await complete({ ...base, model }), 'ok');
    assert.equal(sent.length, 1, model);
    assert.equal('reasoning_effort' in sent[0], false, model);
    assert.equal(sent[0].temperature, 0.5, model);
  }
});

test('A6: gpt-5.5 skips temperature, which it rejects, so a normal reply still costs one request', async () => {
  replies = [reply('ok')];
  assert.equal(await complete({ ...base, model: 'gpt-5.5' }), 'ok');
  assert.equal(sent.length, 1);
  assert.equal('temperature' in sent[0], false);
  assert.equal('reasoning_effort' in sent[0], false);
});

test('a reply with null content that was not cut off comes back as an empty string', async () => {
  replies = [reply(null, 'stop')];
  assert.equal(await complete({ ...base, model: 'gpt-x' }), '');
});
