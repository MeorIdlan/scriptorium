import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requestControls,
  withoutRejected,
  retryCap,
  isBlank,
  cutOffError,
  runRecovering,
} from '../src/services/providers/reasoning.js';

const probe = JSON.parse(readFileSync(new URL('./fixtures/reasoningProbe.json', import.meta.url), 'utf8'));
const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('retryCap quadruples the cap, floors at 1024 and stops at 8000', () => {
  assert.equal(retryCap(10), 1024); // Test Connection
  assert.equal(retryCap(300), 1200);
  assert.equal(retryCap(3000), 8000);
  assert.equal(retryCap(8000), null);
});

test('isBlank treats empty, whitespace-only and missing text as blank', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank('  \n'), true);
  assert.equal(isBlank(null), true);
  assert.equal(isBlank(undefined), true);
  assert.equal(isBlank('a'), false);
});

test('cutOffError names the cause, suggests another model and carries 502 AI_OUTPUT_CUT_OFF', () => {
  const err = cutOffError('claude-opus-5-5');
  assert.equal(err.code, 'AI_OUTPUT_CUT_OFF');
  assert.equal(err.status, 502);
  assert.match(err.message, /claude-opus-5-5/);
  assert.match(err.message, /another model/);
});

const controls = [{ field: 'thinking', value: { type: 'disabled' }, match: /thinking/i }];
const params = { model: 'm', max_tokens: 50, temperature: 0.5, thinking: { type: 'disabled' } };

test('withoutRejected removes temperature when a 400 names it', () => {
  const out = withoutRejected(apiError(400, '`temperature` is deprecated for this model.'), params, controls);
  assert.equal('temperature' in out, false);
  assert.deepEqual(out.thinking, { type: 'disabled' });
  assert.equal('temperature' in params, true, 'does not mutate the input');
});

test('withoutRejected removes both temperature and the control when a 400 names both', () => {
  const out = withoutRejected(apiError(400, "temperature and thinking.type are not supported here"), params, controls);
  assert.equal('temperature' in out, false);
  assert.equal('thinking' in out, false);
});

test('withoutRejected returns null for a 400 that names nothing we sent', () => {
  assert.equal(withoutRejected(apiError(400, 'model: not found'), params, controls), null);
});

test('withoutRejected returns null for a non-400 even when it names temperature', () => {
  assert.equal(withoutRejected(apiError(429, 'temperature rate limit'), params, controls), null);
});

test('requestControls sends nothing for models that work today and for unknown ids', () => {
  for (const r of probe.filter((p) => p.worksToday)) {
    assert.deepEqual(requestControls(r.provider, r.model).controls, [], r.model);
  }
  assert.deepEqual(requestControls('anthropic', 'claude-x').controls, []);
  assert.deepEqual(requestControls('openai', 'gpt-x').controls, []);
  assert.equal(requestControls('anthropic', 'claude-x').temperature, true);
});

test('requestControls sends a control to every model that fails today', () => {
  for (const r of probe.filter((p) => !p.worksToday)) {
    assert.ok(requestControls(r.provider, r.model).controls.length > 0, r.model);
  }
});

test('every control the table sends was accepted in the real probe', () => {
  for (const r of probe) {
    const { controls: sent } = requestControls(r.provider, r.model);
    if (!sent.length) continue;
    const body = Object.fromEntries(sent.map((c) => [c.field, c.value]));
    const accepted = r.attempts.some((a) => same(a.controls, body) && a.status === 'ok');
    assert.ok(accepted, `${r.model} probe has no accepted attempt with ${JSON.stringify(body)}`);
  }
});

test('the temperature flag matches what the real probe saw each model accept', () => {
  for (const r of probe) {
    const attempt = r.attempts.find((a) => same(a.controls, { temperature: 0.7 }));
    if (!attempt) continue;
    assert.equal(requestControls(r.provider, r.model).temperature, attempt.status === 'ok', r.model);
  }
});

test('every real 400 about a control matches the table entry for that model', () => {
  for (const r of probe) {
    const { controls: sent } = requestControls(r.provider, r.model);
    for (const a of r.attempts) {
      const field = Object.keys(a.controls).find((k) => k !== 'temperature');
      if (!field || a.status === 'ok') continue;
      const entry = sent.find((c) => c.field === field) ?? { match: null };
      // a rejected control we do not send needs no match; one we send must be recognisable
      if (sent.some((c) => c.field === field)) assert.match(a.error, entry.match, `${r.model} ${field}`);
    }
  }
});

// --- runRecovering -------------------------------------------------------

const ok = (text, cutOff = false) => ({ text, cutOff });
function harness(steps, overrides = {}) {
  const sent = [];
  let i = 0;
  const send = async (p) => {
    sent.push(p);
    const step = steps[i++];
    if (step instanceof Error) throw step;
    return step;
  };
  const read = (raw) => raw;
  const run = () => runRecovering({ model: 'm', params: { max_tokens: 300, temperature: 0.5, thinking: 1 }, controls, capField: 'max_tokens', send, read, ...overrides });
  return { sent, run };
}

test('runRecovering: a normal reply costs one request', async () => {
  const h = harness([ok('hi')]);
  assert.equal(await h.run(), 'hi');
  assert.equal(h.sent.length, 1);
});

test('runRecovering: blank reply that hit the cap is retried once with the larger cap', async () => {
  const h = harness([ok('', true), ok('hi')]);
  assert.equal(await h.run(), 'hi');
  assert.equal(h.sent[1].max_tokens, retryCap(300));
});

test('runRecovering: a whitespace-only cut-off counts as empty', async () => {
  const h = harness([ok(' \n', true), ok('hi')]);
  assert.equal(await h.run(), 'hi');
  assert.equal(h.sent.length, 2);
});

test('runRecovering: text that was cut off is returned as is, without a retry', async () => {
  const h = harness([ok('partial', true)]);
  assert.equal(await h.run(), 'partial');
  assert.equal(h.sent.length, 1);
});

test('runRecovering: a blank reply that was not cut off is returned as is', async () => {
  const h = harness([ok('', false)]);
  assert.equal(await h.run(), '');
  assert.equal(h.sent.length, 1);
});

test('runRecovering: a second cut-off empty fails with AI_OUTPUT_CUT_OFF after two requests', async () => {
  const h = harness([ok('', true), ok('', true)]);
  await assert.rejects(h.run(), (e) => e.code === 'AI_OUTPUT_CUT_OFF');
  assert.equal(h.sent.length, 2);
});

test('runRecovering: a cap already at 8000 fails at once, with no retry', async () => {
  const h = harness([ok('', true)]);
  await assert.rejects(
    runRecovering({ model: 'm', params: { max_tokens: 8000 }, controls, capField: 'max_tokens', send: async (p) => (h.sent.push(p), ok('', true)), read: (r) => r }),
    (e) => e.code === 'AI_OUTPUT_CUT_OFF'
  );
  assert.equal(h.sent.length, 1);
});

test('runRecovering: a rejection 400 is retried once with the named parameter removed', async () => {
  const h = harness([apiError(400, '`temperature` is deprecated'), ok('hi')]);
  assert.equal(await h.run(), 'hi');
  assert.equal('temperature' in h.sent[1], false);
  assert.equal('thinking' in h.sent[1], true);
});

test('runRecovering: a second, different rejection fails with that error instead of a third request', async () => {
  const second = apiError(400, 'thinking is not supported');
  const h = harness([apiError(400, '`temperature` is deprecated'), second]);
  await assert.rejects(h.run(), (e) => e === second);
  assert.equal(h.sent.length, 2);
});

test('runRecovering: rejection, then cut-off, then another cut-off stops at three requests', async () => {
  const h = harness([apiError(400, '`temperature` is deprecated'), ok('', true), ok('', true)]);
  await assert.rejects(h.run(), (e) => e.code === 'AI_OUTPUT_CUT_OFF');
  assert.equal(h.sent.length, 3);
});

test('runRecovering: an unrelated 400 and a 500 are not retried', async () => {
  for (const err of [apiError(400, 'model: not found'), apiError(500, 'server error')]) {
    const h = harness([err]);
    await assert.rejects(h.run(), (e) => e === err);
    assert.equal(h.sent.length, 1);
  }
});
