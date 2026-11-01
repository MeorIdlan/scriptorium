import OpenAI from 'openai';
import { requestControls, runRecovering } from './reasoning.js';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new OpenAI({ apiKey });
  // Ask for the least reasoning the model allows; reasoning tokens count against the cap
  const { temperature: takesTemperature, controls } = requestControls('openai', model);
  const params = {
    model,
    // max_tokens is refused by the gpt-5 family; max_completion_tokens works for every chat model
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    ...(takesTemperature ? { temperature } : {}),
    ...Object.fromEntries(controls.map((c) => [c.field, c.value])),
  };
  return runRecovering({
    model,
    params,
    controls,
    capField: 'max_completion_tokens',
    send: (p) => client.chat.completions.create(p),
    read: (res) => ({
      text: res.choices[0].message.content ?? '',
      cutOff: res.choices[0].finish_reason === 'length',
    }),
  });
}

export async function listModels({ apiKey }) {
  const client = new OpenAI({ apiKey });
  const list = await client.models.list();
  return list.data
    .filter((m) => /^(gpt-|o[1-9]|o\d)/.test(m.id))
    .sort((a, b) => b.created - a.created)
    .map((m) => ({ id: m.id, name: m.id }));
}
