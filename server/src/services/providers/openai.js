import OpenAI from 'openai';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new OpenAI({ apiKey });
  // max_tokens is refused by the gpt-5 family; max_completion_tokens works for every chat model
  const request = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  };
  let res;
  try {
    res = await client.chat.completions.create({ ...request, temperature });
  } catch (err) {
    // Some models only allow their default temperature; retry once without it
    if (err.status !== 400 || !/temperature/i.test(err.message)) throw err;
    res = await client.chat.completions.create(request);
  }
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
