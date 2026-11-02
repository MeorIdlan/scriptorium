import { useSyncExternalStore } from 'react';
import { LAYOUT_QUERIES } from '../utils/layoutMode.js';

// The lists are made once per matchMedia, not once per render
let cache = { matchMedia: null, lists: null };

function lists() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (cache.matchMedia !== window.matchMedia) {
    cache = {
      matchMedia: window.matchMedia,
      lists: [window.matchMedia(LAYOUT_QUERIES.phone), window.matchMedia(LAYOUT_QUERIES.tablet)],
    };
  }
  return cache.lists;
}

function subscribe(onChange) {
  const watched = lists();
  if (!watched) return () => {};
  for (const list of watched) list.addEventListener('change', onChange);
  return () => {
    for (const list of watched) list.removeEventListener('change', onChange);
  };
}

function getSnapshot() {
  const watched = lists();
  if (!watched) return 'desktop';
  if (watched[0].matches) return 'phone';
  if (watched[1].matches) return 'tablet';
  return 'desktop';
}

// 'phone' | 'tablet' | 'desktop'; desktop when the browser has no matchMedia
export function useLayoutMode() {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'desktop');
}
