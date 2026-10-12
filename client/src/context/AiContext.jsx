import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../utils/api.js';
import { useAuth } from './AuthContext.jsx';

const AiContext = createContext(null);

// Only what decides AI on/off; the server works both out (see settingsService)
function pick(settings) {
  return { aiEnabled: Boolean(settings?.aiEnabled), aiAvailable: Boolean(settings?.aiAvailable) };
}

// Whether the writer has AI on. It counts as off until settings load (or if
// they fail to), so no AI control shows and nothing calls a provider first.
export function AiProvider({ children }) {
  const { status } = useAuth();
  const [state, setState] = useState(null);
  // True once the first read has finished, even if it failed
  const [ready, setReady] = useState(false);
  // Bumped by setAiState, so a read that started before it can't undo it
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const started = version.current;
    try {
      const next = pick(await api.get('/settings'));
      if (version.current === started) setState(next);
    } catch {
      // Keeps the last known state; before any load that is off
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') refresh();
    else {
      setState(null);
      setReady(false);
    }
  }, [status, refresh]);

  // Settings passes its saved reply here so every room updates without a reload
  const setAiState = useCallback((settings) => {
    version.current += 1;
    setState(pick(settings));
    setReady(true);
  }, []);

  const aiOn = Boolean(state?.aiEnabled && state?.aiAvailable);

  return (
    <AiContext.Provider value={{ aiOn, ready, refresh, setAiState }}>
      {children}
    </AiContext.Provider>
  );
}

export function useAiState() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAiState must be used within AiProvider');
  return ctx;
}
