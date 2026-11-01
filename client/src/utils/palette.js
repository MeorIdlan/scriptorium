// The writer's colour palette. The account holds the choice (Settings.palette);
// this browser caches it so the first paint is right, and index.html applies the
// cache before the bundle loads. Keep PALETTES and CACHE_KEY in step with the
// inline script there (a test checks they match).
export const PALETTES = ['votive', 'nave', 'reliquary'];
export const DEFAULT_PALETTE = 'votive';
export const CACHE_KEY = 'scriptorium.palette';

export function isPalette(value) {
  return PALETTES.includes(value);
}

// The cached palette; Votive when nothing usable is cached or storage is blocked
export function readCachedPalette() {
  try {
    const value = globalThis.localStorage?.getItem(CACHE_KEY);
    return isPalette(value) ? value : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

// Storage can be blocked (private window, cleared site data); the palette then
// lasts for the session only
export function rememberPalette(name) {
  if (!isPalette(name)) return;
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, name);
  } catch {
    // Not cached
  }
}

export function applyPalette(name) {
  document.documentElement.dataset.palette = isPalette(name) ? name : DEFAULT_PALETTE;
}

// Takes the palette the account reports: applies it and caches it. An absent or
// unknown value (a failed read, an older server) changes nothing.
export function syncPalette(name) {
  if (!isPalette(name)) return;
  applyPalette(name);
  rememberPalette(name);
}
