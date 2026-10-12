import { getSettings, assertAiEnabled } from '../services/settingsService.js';
import { usesFakeLlm } from '../services/llmService.js';

// Refuses AI routes up front, before any story context (and its chapter
// summaries) gets built; llmService.complete() checks again as a backstop
export function requireAiEnabled(loadSettings = getSettings) {
  return async (req, res, next) => {
    // The test-only fake provider needs no key, like complete()
    if (usesFakeLlm()) return next();
    try {
      assertAiEnabled(await loadSettings(req.user.id));
      next();
    } catch (err) {
      next(err);
    }
  };
}
