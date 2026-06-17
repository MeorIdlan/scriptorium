import OpenAI from 'openai';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  return res.choices[0].message.content;
}

export async function listModels({ apiKey }) {
  const client = new OpenAI({ apiKey });
  const list = await client.models.list();
  return list.data
    .filter((m) => /^(gpt-|o[1-9]|o\d)/.test(m.id))
    .sort((a, b) => b.created - a.created)
    .map((m) => ({ id: m.id, name: m.id }));
}
