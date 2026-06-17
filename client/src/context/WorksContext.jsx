import { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from '../utils/api.js';

const initialState = {
  works: [],
  loading: false,
  error: null,
};

function worksReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    case 'SET_WORKS':
      return { ...state, works: action.works, loading: false, error: null };
    case 'ADD_WORK':
      return { ...state, works: [action.work, ...state.works] };
    case 'REMOVE_WORK':
      return { ...state, works: state.works.filter((w) => w.id !== action.id) };
    case 'UPDATE_WORK':
      return {
        ...state,
        works: state.works.map((w) =>
          w.id === action.id ? { ...w, ...action.partial } : w
        ),
      };
    default:
      return state;
  }
}

export const WorksContext = createContext(null);

export function WorksProvider({ children }) {
  const [state, dispatch] = useReducer(worksReducer, initialState);

  const fetchWorks = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const works = await api.get('/works');
      dispatch({ type: 'SET_WORKS', works });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }, []);

  const addWork = useCallback((work) => {
    dispatch({ type: 'ADD_WORK', work });
  }, []);

  const removeWork = useCallback((id) => {
    dispatch({ type: 'REMOVE_WORK', id });
  }, []);

  const updateWork = useCallback((id, partial) => {
    dispatch({ type: 'UPDATE_WORK', id, partial });
  }, []);

  return (
    <WorksContext.Provider value={{ state, fetchWorks, addWork, removeWork, updateWork }}>
      {children}
    </WorksContext.Provider>
  );
}

export function useWorks() {
  const ctx = useContext(WorksContext);
  if (!ctx) throw new Error('useWorks must be used within WorksProvider');
  return ctx;
}
