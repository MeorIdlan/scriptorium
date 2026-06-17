import { createContext, useContext, useReducer, useCallback } from 'react';

const initialState = {
  chapterId: null,
  content: '',
  hasUnsavedChanges: false,
  saveStatus: 'saved', // 'saved' | 'saving' | 'error'
  pendingReplacement: null, // { text, id } — signals Editor to swap DOM content
};

function editorReducer(state, action) {
  switch (action.type) {
    case 'SET_CHAPTER_ID':
      return { ...state, chapterId: action.chapterId };
    case 'SET_CONTENT':
      return { ...state, content: action.content, hasUnsavedChanges: true };
    case 'SET_SAVE_STATUS':
      return {
        ...state,
        saveStatus: action.status,
        hasUnsavedChanges: action.status === 'saved' ? false : state.hasUnsavedChanges,
      };
    case 'LOAD_CONTENT':
      return {
        ...state,
        content: action.content,
        chapterId: action.chapterId,
        hasUnsavedChanges: false,
        saveStatus: 'saved',
      };
    case 'REPLACE_CONTENT':
      return { ...state, pendingReplacement: { text: action.text, id: Date.now() } };
    case 'CLEAR_REPLACEMENT':
      return { ...state, pendingReplacement: null };
    default:
      return state;
  }
}

export const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  const setContent = useCallback((text) => {
    dispatch({ type: 'SET_CONTENT', content: text });
  }, []);

  const setSaveStatus = useCallback((status) => {
    dispatch({ type: 'SET_SAVE_STATUS', status });
  }, []);

  const setChapterId = useCallback((chapterId) => {
    dispatch({ type: 'SET_CHAPTER_ID', chapterId });
  }, []);

  const loadContent = useCallback((chapterId, content) => {
    dispatch({ type: 'LOAD_CONTENT', chapterId, content });
  }, []);

  const replaceContent = useCallback((text) => {
    dispatch({ type: 'REPLACE_CONTENT', text });
  }, []);

  const clearReplacement = useCallback(() => {
    dispatch({ type: 'CLEAR_REPLACEMENT' });
  }, []);

  return (
    <EditorContext.Provider value={{ state, setContent, setSaveStatus, setChapterId, loadContent, replaceContent, clearReplacement }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
