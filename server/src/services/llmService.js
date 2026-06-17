import { getSettings } from './settingsService.js';
import * as anthropicProvider from './providers/anthropic.js';
import * as openaiProvider from './providers/openai.js';

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

export async function complete({ system, prompt, maxTokensOverride } = {}) {
  const settings = getSettings();
  const providerId = settings.activeProvider;
  const providerConfig = settings.providers[providerId];

  if (!providerConfig?.apiKey) {
    const err = new Error('No API key configured for active provider');
    err.status = 400;
    err.code = 'NO_API_KEY';
    throw err;
  }

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
