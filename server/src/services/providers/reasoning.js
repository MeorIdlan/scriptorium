// Provider-neutral rules for reasoning models. Thinking tokens count against the
// output cap, so a small cap can come back with no text. Each adapter asks for the
// least thinking the model allows and, if a cut-off still leaves nothing, retries once
// with a larger cap. At most 3 requests per call: the first, one rejection retry and
// one cut-off retry. Table entries come from a real-key probe of each model
// (server/test/fixtures/reasoningProbe.json).

export const MAX_CAP = 8000;
export const CAP_FLOOR = 1024;

// First match by model-id prefix wins. `temperature: false` marks models the probe saw
// answer 400 to `temperature`, so the one rejection retry isn't spent on it. A control is
// sent only to families known to need one; `match` recognises a 400 that rejects it.
const FAMILIES = [
  { provider: 'anthropic', prefix: 'claude-sonnet-5', temperature: false, controls: [{ field: 'thinking', value: { type: 'between_tools' }, match: /thinking/i }] },
  { provider: 'anthropic', prefix: 'claude-haiku-5', temperature: false, controls: [{ field: 'thinking', value: { type: 'disabled' }, match: /thinking/i }] },
  { provider: 'anthropic', prefix: 'claude-opus-5', temperature: false, controls: [{ field: 'output_config', value: { effort: 'low' }, match: /effort/i }] },
  { provider: 'openai', prefix: 'gpt-5-mini', temperature: false, controls: [{ field: 'reasoning_effort', value: 'minimal', match: /reasoning_effort/i }] },
  { provider: 'openai', prefix: 'o3', temperature: false, controls: [{ field: 'reasoning_effort', value: 'low', match: /reasoning_effort/i }] },
  { provider: 'openai', prefix: 'gpt-6', temperature: false, controls: [{ field: 'reasoning_effort', value: 'low', match: /reasoning_effort/i }] },
  { provider: 'openai', prefix: 'gpt-5.5', temperature: false, controls: [] },
];

export function requestControls(provider, model) {
  const family = FAMILIES.find((f) => f.provider === provider && String(model).startsWith(f.prefix));
  return { temperature: family ? family.temperature : true, controls: family ? family.controls : [] };
}

// The request without every parameter a 400 names; null when it isn't a 400 or names none
export function withoutRejected(err, params, controls) {
  if (err?.status !== 400) return null;
  const message = String(err.message);
  const named = [];
  if (/temperature/i.test(message) && 'temperature' in params) named.push('temperature');
  for (const c of controls) if (c.field in params && c.match.test(message)) named.push(c.field);
  if (!named.length) return null;
  const out = { ...params };
  for (const field of named) delete out[field];
  return out;
}

export function retryCap(cap) {
  if (cap >= MAX_CAP) return null;
  return Math.min(MAX_CAP, Math.max(cap * 4, CAP_FLOOR));
}

export function isBlank(text) {
  return !text || !String(text).trim();
}

export function cutOffError(model) {
  const err = new Error(
    `The AI model ${model} used its whole token budget thinking and returned no text. Choose another model in Settings.`
  );
  err.code = 'AI_OUTPUT_CUT_OFF';
  err.status = 502;
  return err;
}

// send(params) -> raw reply; read(raw) -> { text, cutOff }; capField: the cap's parameter name
export async function runRecovering({ model, params, controls, capField, send, read }) {
  let current = params;
  let rejectionRetried = false;
  let capRetried = false;
  for (;;) {
    let raw;
    try {
      raw = await send(current);
    } catch (err) {
      const stripped = rejectionRetried ? null : withoutRejected(err, current, controls);
      if (!stripped) throw err;
      rejectionRetried = true;
      current = stripped;
      continue;
    }
    const { text, cutOff } = read(raw);
    if (!(cutOff && isBlank(text))) return text;
    const bigger = retryCap(current[capField]);
    if (capRetried || bigger === null) throw cutOffError(model);
    capRetried = true;
    current = { ...current, [capField]: bigger };
  }
}
