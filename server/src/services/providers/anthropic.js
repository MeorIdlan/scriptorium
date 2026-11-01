import Anthropic from '@anthropic-ai/sdk';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new Anthropic({ apiKey });
  const request = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  let res;
  try {
    res = await client.messages.create({ ...request, temperature });
  } catch (err) {
    // Newer Claude models reject `temperature` outright; retry once without it
    if (err.status !== 400 || !/temperature/i.test(err.message)) throw err;
    res = await client.messages.create(request);
  }
  // Newer models may put a thinking block before the text
  return res.content
    .filter((block) => typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
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
