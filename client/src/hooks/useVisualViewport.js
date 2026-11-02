import { useLayoutEffect } from 'react';
import { useLayoutMode } from './useLayoutMode.js';

// On phones and tablets the on-screen keyboard shrinks the visual viewport but not the layout
// viewport or `dvh`, so the layout would sit under the keyboard. This writes the visual
// viewport's height and offset to --app-height and --app-top on <html>, which the stylesheet
// uses for the layout's height and top. Desktop sets nothing; no visualViewport sets nothing.
export function useVisualViewport() {
  const mode = useLayoutMode();
  useLayoutEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (mode === 'desktop' || !vv) return undefined;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty('--app-height', `${vv.height}px`);
      root.style.setProperty('--app-top', `${vv.offsetTop}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-top');
    };
  }, [mode]);
}
