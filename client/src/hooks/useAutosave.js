import { useEffect, useRef } from 'react';
import { api } from '../utils/api.js';
import { useEditor } from '../context/EditorContext.jsx';
import { useActiveWork } from '../context/ActiveWorkContext.jsx';

const AUTOSAVE_DELAY = 5000; // 5 seconds

export function useAutosave(workId) {
  const { state, setSaveStatus } = useEditor();
  const { updateChapter } = useActiveWork();
  const timerRef = useRef(null);
  // The unsaved edit, captured with its chapter so it can't be saved under
  // another one; cleared as soon as its save goes out
  const pendingRef = useRef(null);
  const workIdRef = useRef(workId);
  workIdRef.current = workId;
  const updateChapterRef = useRef(updateChapter);
  updateChapterRef.current = updateChapter;

  // The chapter list (and so the footer's Total) holds the count from when the
  // work loaded; a save's reply carries the server's new one. A reply without a
  // count changes nothing. A chapter that is no longer in the list matches nothing.
  function applySaved(chapterId, saved) {
    if (typeof saved?.wordCount !== 'number') return;
    updateChapterRef.current(chapterId, { wordCount: saved.wordCount });
  }

  useEffect(() => {
    if (!state.hasUnsavedChanges || !workId || !state.chapterId) return;

    pendingRef.current = { chapterId: state.chapterId, content: state.content, contentHtml: state.html };

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setSaveStatus('saving');

    timerRef.current = setTimeout(async () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;

      try {
        const saved = await savePending(workId, pending);
        applySaved(pending.chapterId, saved);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave failed:', err);
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.content, state.html, state.hasUnsavedChanges, workId, state.chapterId, setSaveStatus]);

  // Leaving the chapter (a switch remounts the editor) or the room: save what
  // the timer would have saved, now. Success leaves the status alone, since it
  // belongs to whatever the editor shows next.
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || !workIdRef.current) return;
      savePending(workIdRef.current, pending).catch((err) => {
        console.error('Autosave failed:', err);
        setSaveStatus('error');
      });
    },
    [setSaveStatus]
  );
}

function savePending(workId, { chapterId, content, contentHtml }) {
  return api.put(`/works/${workId}/chapters/${chapterId}`, { content, contentHtml });
}
