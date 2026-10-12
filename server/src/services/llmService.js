import { getSettings, assertAiEnabled } from './settingsService.js';
import * as anthropicProvider from './providers/anthropic.js';
import * as openaiProvider from './providers/openai.js';
import * as fakeProvider from './providers/fake.js';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
];

const ADAPTERS = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export function listProviders() {
  return PROVIDERS;
}

export async function complete({ system, prompt, maxTokensOverride, userId } = {}) {
  // Local verification only: never reachable in development or production
  if (process.env.NODE_ENV === 'test' && process.env.LLM_PROVIDER_OVERRIDE === 'fake') {
    return fakeProvider.complete({ system, prompt });
  }
  const settings = await getSettings(userId);
  assertAiEnabled(settings);
  const providerId = settings.activeProvider;
  const providerConfig = settings.providers[providerId];

  const adapter = ADAPTERS[providerId];
  if (!adapter) {
    const err = new Error(`Unknown provider: ${providerId}`);
    err.status = 400;
    err.code = 'UNKNOWN_PROVIDER';
    throw err;
  }

  return adapter.complete({
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    system,
    prompt,
    maxTokens: maxTokensOverride ?? settings.generation?.maxTokens ?? 1000,
    temperature: settings.generation?.temperature ?? 0.7,
  });
}
