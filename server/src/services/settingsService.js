import Settings from '../models/Settings.js';

const SETTINGS_ID = 'singleton';

const DEFAULT_SETTINGS = {
  activeProvider: 'anthropic',
  providers: {
    anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
    openai: { apiKey: '', model: 'gpt-4o' },
  },
  generation: { maxTokens: 1000, temperature: 0.7 },
  autoFeatures: { rekindler: 'prompt' },
};

export async function getSettings() {
  const stored = await Settings.findById(SETTINGS_ID).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  return deepMerge(structuredClone(DEFAULT_SETTINGS), rest);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const merged = deepMerge(current, partial);
  merged.updatedAt = new Date().toISOString();
  await Settings.findByIdAndUpdate(SETTINGS_ID, merged, { upsert: true, new: true });
  return merged;
}

export function maskSettings(settings) {
  const masked = structuredClone(settings);
  for (const [id, provider] of Object.entries(masked.providers)) {
    const key = provider.apiKey || '';
    masked.providers[id] = {
      ...provider,
      apiKey: undefined,
      hasKey: key.length > 0,
      keyPreview:
        key.length > 12
          ? key.slice(0, 8) + '…' + key.slice(-4)
          : key.length > 0
          ? key.slice(0, 4) + '…'
          : null,
    };
    delete masked.providers[id].apiKey;
  }
  return masked;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      out[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
