import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

// The list is made once per matchMedia, not once per render
let cache = { matchMedia: null, list: null };

function list() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (cache.matchMedia !== window.matchMedia) {
    cache = { matchMedia: window.matchMedia, list: window.matchMedia(QUERY) };
  }
  return cache.list;
}

function subscribe(onChange) {
  const watched = list();
  if (!watched) return () => {};
  watched.addEventListener('change', onChange);
  return () => watched.removeEventListener('change', onChange);
}

function getSnapshot() {
  return list()?.matches ?? false;
}

// True when the main pointer is a finger, as on a phone or a tablet; false with no matchMedia.
// A wide touch screen has no Ctrl/Cmd+Shift+I either, so it gets the on-screen Catch button.
export function useCoarsePointer() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
