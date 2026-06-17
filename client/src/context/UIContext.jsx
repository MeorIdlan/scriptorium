import { createContext, useContext, useReducer } from 'react';

const initialState = {
  activeRoom: 'shelves',
  activePanelTab: 'quill',
  catchOverlayOpen: false,
  selectedMapChapterId: null,
  hookGeneratorOpen: false,
  exportModalOpen: false,
  exportWorkId: null,
};

function uiReducer(state, action) {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, activeRoom: action.room };
    case 'SET_PANEL_TAB':
      return { ...state, activePanelTab: action.tab };
    case 'OPEN_CATCH':
      return { ...state, catchOverlayOpen: true };
    case 'CLOSE_CATCH':
      return { ...state, catchOverlayOpen: false };
    case 'SET_MAP_CHAPTER':
      return { ...state, selectedMapChapterId: action.chapterId };
    case 'TOGGLE_HOOK_GENERATOR':
      return { ...state, hookGeneratorOpen: !state.hookGeneratorOpen };
    case 'OPEN_EXPORT':
      return { ...state, exportModalOpen: true, exportWorkId: action.workId };
    case 'CLOSE_EXPORT':
      return { ...state, exportModalOpen: false, exportWorkId: null };
    default:
      return state;
  }
}

export const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  return (
    <UIContext.Provider value={{ state, dispatch }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
