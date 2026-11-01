import Anthropic from '@anthropic-ai/sdk';
import { requestControls, runRecovering } from './reasoning.js';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new Anthropic({ apiKey });
  // Ask for the least thinking the model allows; thinking tokens count against the cap
  const { temperature: takesTemperature, controls } = requestControls('anthropic', model);
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    ...(takesTemperature ? { temperature } : {}),
    ...Object.fromEntries(controls.map((c) => [c.field, c.value])),
  };
  return runRecovering({
    model,
    params,
    controls,
    capField: 'max_tokens',
    send: (p) => client.messages.create(p),
    // Newer models may put a thinking block before the text
    read: (res) => ({
      text: res.content
        .filter((block) => typeof block.text === 'string')
        .map((block) => block.text)
        .join(''),
      cutOff: res.stop_reason === 'max_tokens',
    }),
  });
}

export async function listModels({ apiKey }) {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
}
