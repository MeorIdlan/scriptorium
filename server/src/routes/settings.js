import { Router } from 'express';
import { getSettings, saveSettings, maskSettings } from '../services/settingsService.js';
import { listProviders } from '../services/llmService.js';
import { httpError } from '../middleware/errorHandler.js';
import * as anthropicProvider from '../services/providers/anthropic.js';
import * as openaiProvider from '../services/providers/openai.js';

const router = Router();

const ADAPTERS = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

// GET /api/settings
router.get('/', (req, res) => {
  res.json(maskSettings(getSettings()));
});

// PUT /api/settings
router.put('/', (req, res, next) => {
  try {
    const body = req.body;

    // Validate generation fields if present
    if (body.generation) {
      const { maxTokens, temperature } = body.generation;
      if (maxTokens !== undefined && (maxTokens < 256 || maxTokens > 8000)) {
        return next(httpError(400, 'VALIDATION_ERROR', 'maxTokens must be between 256 and 8000'));
      }
      if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
        return next(httpError(400, 'VALIDATION_ERROR', 'temperature must be between 0 and 1'));
      }
    }

    // For providers, only update apiKey if non-empty value sent
    const settings = getSettings();
    const partial = { ...body };

    if (body.providers) {
      const mergedProviders = { ...settings.providers };
      for (const [providerId, providerData] of Object.entries(body.providers)) {
        mergedProviders[providerId] = { ...(mergedProviders[providerId] || {}) };
        // Copy all fields except apiKey
        for (const [k, v] of Object.entries(providerData)) {
          if (k === 'apiKey') {
            // Only update if non-empty
            if (v && v.trim() !== '') {
              mergedProviders[providerId].apiKey = v.trim();
            }
          } else {
            mergedProviders[providerId][k] = v;
          }
        }
      }
      partial.providers = mergedProviders;
    }

    const updated = saveSettings(partial);
    res.json(maskSettings(updated));
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/providers
router.get('/providers', (req, res) => {
  res.json(listProviders());
});

// POST /api/settings/models — fetch available models for a provider; accepts an optional unsaved apiKey
router.post('/models', async (req, res, next) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider) return next(httpError(400, 'MISSING_FIELD', 'provider is required'));

    const settings = getSettings();
    const resolvedKey = (apiKey && apiKey.trim()) || settings.providers[provider]?.apiKey;

    if (!resolvedKey) {
      return res.json({ ok: false, error: 'No API key provided' });
    }

    const adapter = ADAPTERS[provider];
    if (!adapter) {
      return res.json({ ok: false, error: `Unknown provider: ${provider}` });
    }

    if (!adapter.listModels) {
      return res.json({ ok: false, error: `Provider ${provider} does not support model listing` });
    }

    try {
      const models = await adapter.listModels({ apiKey: resolvedKey });
      res.json({ ok: true, models });
    } catch (testErr) {
      res.json({ ok: false, error: testErr.message });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test
router.post('/test', async (req, res, next) => {
  try {
    const { provider } = req.body;
    if (!provider) return next(httpError(400, 'MISSING_FIELD', 'provider is required'));

    const settings = getSettings();
    const providerConfig = settings.providers[provider];

    if (!providerConfig?.apiKey) {
      return res.json({ ok: false, error: 'No API key configured for this provider' });
    }

    const adapter = ADAPTERS[provider];
    if (!adapter) {
      return res.json({ ok: false, error: `Unknown provider: ${provider}` });
    }

    try {
      await adapter.complete({
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
        system: 'You are a helpful assistant.',
        prompt: 'Reply with the single word: OK',
        maxTokens: 10,
        temperature: 0,
      });
      res.json({ ok: true, model: providerConfig.model });
    } catch (testErr) {
      res.json({ ok: false, error: testErr.message });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
