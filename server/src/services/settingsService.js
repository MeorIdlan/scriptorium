import Settings from '../models/Settings.js';
import { httpError } from '../middleware/errorHandler.js';

const DEFAULT_SETTINGS = {
  activeProvider: 'anthropic',
  providers: {
    anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
    openai: { apiKey: '', model: 'gpt-4o' },
  },
  generation: { maxTokens: 1000, temperature: 0.7 },
  autoFeatures: { rekindler: 'prompt' },
};

export async function getSettings(userId) {
  const stored = await Settings.findById(userId).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  return deepMerge(structuredClone(DEFAULT_SETTINGS), rest);
}

export async function saveSettings(userId, partial) {
  const current = await getSettings(userId);
  const merged = deepMerge(current, partial);
  delete merged._id;
  delete merged.id;
  merged.updatedAt = new Date().toISOString();
  await Settings.findByIdAndUpdate(userId, merged, { upsert: true, new: true });
  return merged;
}

// Clears one provider's saved key with a single atomic $set that touches no
// other field. The id lands in a dotted Mongo path, so it must be a known provider. aiEnabled
// is left alone: with the key gone AI reads as off (isAiAvailable), and a later
// key brings it back unless the writer had turned it off.
export async function removeProviderKey(userId, providerId) {
  if (!Object.hasOwn(DEFAULT_SETTINGS.providers, providerId)) {
    throw httpError(404, 'UNKNOWN_PROVIDER', `Unknown provider: ${providerId}`);
  }
  // Save Settings round-trips the masked fields into the document, so a stored
  // provider can also hold keyPreview (the key's first 8 and last 4 characters)
  // and a stale hasKey; none of the key may stay behind
  const path = `providers.${providerId}`;
  await Settings.updateOne(
    { _id: userId },
    {
      $set: { [`${path}.apiKey`]: '', updatedAt: new Date().toISOString() },
      $unset: { [`${path}.keyPreview`]: '', [`${path}.hasKey`]: '' },
    }
  );
  return getSettings(userId);
}

// AI can only run when the active provider has a key
export function isAiAvailable(settings) {
  return Boolean(settings.providers?.[settings.activeProvider]?.apiKey);
}

// aiEnabled is unset until the writer chooses, so the first saved key turns AI
// on (and existing users with a key stay on); an explicit false always wins
export function isAiEnabled(settings) {
  return isAiAvailable(settings) && settings.aiEnabled !== false;
}

// Throws unless AI may run; a missing key keeps the NO_API_KEY code the
// client already explains
export function assertAiEnabled(settings) {
  if (!isAiAvailable(settings)) {
    throw httpError(400, 'NO_API_KEY', 'No API key configured for active provider');
  }
  if (!isAiEnabled(settings)) {
    throw httpError(403, 'AI_DISABLED', 'AI features are turned off. Turn them on in Settings.');
  }
}

// Checks an aiEnabled change against the settings as they will be after the
// save (partial.providers is the already-merged provider map); null when fine
export function validateAiToggle(current, partial) {
  if (partial.aiEnabled === undefined) return null;
  if (typeof partial.aiEnabled !== 'boolean') {
    return httpError(400, 'VALIDATION_ERROR', 'aiEnabled must be true or false');
  }
  const next = {
    activeProvider: partial.activeProvider ?? current.activeProvider,
    providers: partial.providers ?? current.providers,
  };
  if (!isAiAvailable(next)) {
    return httpError(400, 'NO_API_KEY', 'Save an API key to turn on AI features');
  }
  return null;
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
  masked.aiEnabled = isAiEnabled(settings);
  masked.aiAvailable = isAiAvailable(settings);
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
