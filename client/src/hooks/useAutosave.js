import { useEffect, useRef } from 'react';
import { api } from '../utils/api.js';
import { useEditor } from '../context/EditorContext.jsx';

const AUTOSAVE_DELAY = 5000; // 5 seconds

export function useAutosave(workId) {
  const { state, setSaveStatus } = useEditor();
  const timerRef = useRef(null);
  const latestContentRef = useRef(state.content);
  const latestChapterIdRef = useRef(state.chapterId);

  // Keep refs in sync without triggering effect re-runs
  latestContentRef.current = state.content;
  latestChapterIdRef.current = state.chapterId;

  useEffect(() => {
    if (!state.hasUnsavedChanges || !workId || !state.chapterId) return;

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setSaveStatus('saving');

    timerRef.current = setTimeout(async () => {
      const chapterId = latestChapterIdRef.current;
      const content = latestContentRef.current;
      if (!chapterId || !workId) return;

      try {
        await api.put(`/works/${workId}/chapters/${chapterId}`, { content });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave failed:', err);
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.content, state.hasUnsavedChanges, workId, state.chapterId, setSaveStatus]);
}
