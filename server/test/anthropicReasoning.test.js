import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { complete } from '../src/services/providers/anthropic.js';
import { retryCap } from '../src/services/providers/reasoning.js';

const base = { apiKey: 'sk-1', system: 's', prompt: 'p', maxTokens: 50, temperature: 0.5 };
const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status });
const text = (t, stop = 'end_turn') => ({ content: [{ type: 'text', text: t }], stop_reason: stop });
const cutOff = () => ({ content: [{ type: 'thinking', thinking: '' }], stop_reason: 'max_tokens' });

let sent;
let replies;
beforeEach(() => {
  sent = [];
  mock.method(Anthropic.Messages.prototype, 'create', async (params) => {
    sent.push(params);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  });
});
afterEach(() => mock.restoreAll());

test('first request carries the least-thinking control for each Claude 5.5 model, and no temperature', async () => {
  const expected = {
    'claude-sonnet-5-5': ['thinking', { type: 'between_tools' }],
    'claude-haiku-5-5': ['thinking', { type: 'disabled' }],
    'claude-opus-5-5': ['output_config', { effort: 'low' }],
  };
  for (const [model, [field, value]] of Object.entries(expected)) {
    sent = [];
    replies = [text('ok')];
    assert.equal(await complete({ ...base, model }), 'ok');
    assert.deepEqual(sent[0][field], value, model);
    assert.equal('temperature' in sent[0], false, model);
  }
});

test('A1: a cut-off reply with no text is retried once with a larger cap and returns the retried text', async () => {
  replies = [cutOff(), text('ok')];
  assert.equal(await complete({ ...base, model: 'claude-sonnet-5-5' }), 'ok');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].max_tokens, retryCap(50));
});

test('text that was cut off is returned as is, without a retry', async () => {
  replies = [text('partial', 'max_tokens')];
  assert.equal(await complete({ ...base, model: 'claude-opus-5-5' }), 'partial');
  assert.equal(sent.length, 1);
});

test('A3: a 400 that rejects the thinking control is retried once without it', async () => {
  replies = [apiError(400, '"thinking.type.disabled" is not supported for this model.'), text('ok')];
  assert.equal(await complete({ ...base, model: 'claude-haiku-5-5' }), 'ok');
  assert.equal(sent.length, 2);
  assert.equal('thinking' in sent[1], false);
});

test('A3: an unrelated 400 is not retried', async () => {
  replies = [apiError(400, 'model: not found')];
  await assert.rejects(complete({ ...base, model: 'claude-haiku-5-5' }), /not found/);
  assert.equal(sent.length, 1);
});

test('a second, different rejection after the retry fails instead of making a third request', async () => {
  replies = [apiError(400, '`temperature` is deprecated for this model.'), apiError(400, 'thinking is not supported')];
  await assert.rejects(complete({ ...base, model: 'claude-x' }), /thinking is not supported/);
  assert.equal(sent.length, 2);
});

test('A4: a second cut-off reply fails with an error that names the cause and suggests another model', async () => {
  replies = [cutOff(), cutOff()];
  await assert.rejects(complete({ ...base, model: 'claude-opus-5-5' }), (err) => {
    assert.equal(err.code, 'AI_OUTPUT_CUT_OFF');
    assert.equal(err.status, 502);
    assert.match(err.message, /another model/);
    return true;
  });
  assert.equal(sent.length, 2);
});

test('A6: models that work today make one request and get no thinking control', async () => {
  for (const model of ['claude-sonnet-4-6', 'claude-x']) {
    sent = [];
    replies = [text('ok')];
    assert.equal(await complete({ ...base, model }), 'ok');
    assert.equal(sent.length, 1, model);
    assert.equal('thinking' in sent[0], false, model);
    assert.equal('output_config' in sent[0], false, model);
    assert.equal(sent[0].temperature, 0.5, model);
  }
});
