import { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from '../utils/api.js';

const initialState = {
  work: null,
  chapters: [],
  codex: null,
  catches: [],
  mapData: null,
  threads: [],
  loading: false,
  error: null,
};

function activeWorkReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    case 'SET_WORK':
      return { ...state, work: action.work };
    case 'SET_CHAPTERS':
      return { ...state, chapters: action.chapters };
    case 'SET_CODEX':
      return { ...state, codex: action.codex };
    case 'SET_CATCHES':
      return { ...state, catches: action.catches };
    case 'SET_MAP':
      return { ...state, mapData: action.mapData };
    case 'SET_THREADS':
      return { ...state, threads: action.threads };
    case 'CLEAR':
      return initialState;
    case 'UPDATE_CHAPTER':
      return {
        ...state,
        chapters: state.chapters.map((ch) =>
          ch.id === action.id ? { ...ch, ...action.partial } : ch
        ),
      };
    case 'UPDATE_WORK':
      return { ...state, work: { ...state.work, ...action.partial } };
    default:
      return state;
  }
}

export const ActiveWorkContext = createContext(null);

export function ActiveWorkProvider({ children }) {
  const [state, dispatch] = useReducer(activeWorkReducer, initialState);

  const loadWork = useCallback(async (workId) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_THREADS', threads: [] });
    try {
      const [work, chapters] = await Promise.all([
        api.get(`/works/${workId}`),
        api.get(`/works/${workId}/chapters`),
      ]);
      dispatch({ type: 'SET_WORK', work });
      dispatch({ type: 'SET_CHAPTERS', chapters });
      // Badges need catches before the Catch tab is opened; failure here is not fatal
      api
        .get(`/works/${workId}/catches`)
        .then((catches) => dispatch({ type: 'SET_CATCHES', catches }))
        .catch((err) => console.error('Failed to load catches:', err));
      dispatch({ type: 'SET_LOADING', loading: false });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }, []);

  const refreshChapters = useCallback(async (workId) => {
    try {
      const chapters = await api.get(`/works/${workId}/chapters`);
      dispatch({ type: 'SET_CHAPTERS', chapters });
    } catch (err) {
      console.error('Failed to refresh chapters:', err);
    }
  }, []);

  const refreshCodex = useCallback(async (workId) => {
    try {
      const codex = await api.get(`/works/${workId}/codex`);
      dispatch({ type: 'SET_CODEX', codex });
    } catch (err) {
      console.error('Failed to refresh codex:', err);
    }
  }, []);

  const refreshCatches = useCallback(async (workId) => {
    try {
      const catches = await api.get(`/works/${workId}/catches`);
      dispatch({ type: 'SET_CATCHES', catches });
    } catch (err) {
      console.error('Failed to refresh catches:', err);
    }
  }, []);

  const refreshMap = useCallback(async (workId) => {
    try {
      const mapData = await api.get(`/works/${workId}/map`);
      dispatch({ type: 'SET_MAP', mapData });
    } catch (err) {
      console.error('Failed to refresh map:', err);
    }
  }, []);

  const refreshThreads = useCallback(async (workId) => {
    try {
      const threads = await api.get(`/works/${workId}/threads`);
      dispatch({ type: 'SET_THREADS', threads });
    } catch (err) {
      console.error('Failed to refresh threads:', err);
    }
  }, []);

  const clearActiveWork = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const updateChapter = useCallback((id, partial) => {
    dispatch({ type: 'UPDATE_CHAPTER', id, partial });
  }, []);

  const updateWork = useCallback((partial) => {
    dispatch({ type: 'UPDATE_WORK', partial });
  }, []);

  return (
    <ActiveWorkContext.Provider
      value={{
        state,
        loadWork,
        refreshChapters,
        refreshCodex,
        refreshCatches,
        refreshMap,
        refreshThreads,
        clearActiveWork,
        updateChapter,
        updateWork,
      }}
    >
      {children}
    </ActiveWorkContext.Provider>
  );
}

export function useActiveWork() {
  const ctx = useContext(ActiveWorkContext);
  if (!ctx) throw new Error('useActiveWork must be used within ActiveWorkProvider');
  return ctx;
}
