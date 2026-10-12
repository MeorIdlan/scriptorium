import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const refresh = useCallback(async () => {
    try {
      setState(pick(await api.get('/settings')));
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') refresh();
    else setState(null);
  }, [status, refresh]);

  // Settings passes its saved reply here so every room updates without a reload
  const setAiState = useCallback((settings) => setState(pick(settings)), []);

  const aiOn = Boolean(state?.aiEnabled && state?.aiAvailable);

  return (
    <AiContext.Provider value={{ aiOn, ready: state !== null, refresh, setAiState }}>
      {children}
    </AiContext.Provider>
  );
}

export function useAiState() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAiState must be used within AiProvider');
  return ctx;
}
