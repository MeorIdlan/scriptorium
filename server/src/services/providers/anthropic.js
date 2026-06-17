import Anthropic from '@anthropic-ai/sdk';

export async function complete({ apiKey, model, system, prompt, maxTokens, temperature }) {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text;
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
