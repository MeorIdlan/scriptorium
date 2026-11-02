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

  // The page going to the background (a phone locking its screen or switching apps) can freeze
  // or end it before the 5-second timer runs: save the pending edit now, as the timer would
  useEffect(() => {
    function flushNow() {
      const pending = pendingRef.current;
      if (!pending || !workIdRef.current) return;
      pendingRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveStatus('saving');
      savePending(workIdRef.current, pending, { flush: true })
        .then((saved) => {
          applySaved(pending.chapterId, saved);
          setSaveStatus('saved');
        })
        .catch((err) => {
          console.error('Autosave failed:', err);
          setSaveStatus('error');
          // Keep the edit for the next hide or for leaving the chapter, unless a newer one has taken its place
          if (pendingRef.current === null) pendingRef.current = pending;
        });
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushNow();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushNow);
    };
    // applySaved only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSaveStatus]);

  // Leaving the chapter (a switch remounts the editor) or the room: save what
  // the timer would have saved, now. Success leaves the status alone, since it
  // belongs to whatever the editor shows next.
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || !workIdRef.current) return;
      savePending(workIdRef.current, pending)
        .then((saved) => applySaved(pending.chapterId, saved))
        .catch((err) => {
          console.error('Autosave failed:', err);
          setSaveStatus('error');
        });
    },
    [setSaveStatus]
  );
}

// Browsers refuse a keepalive request body over about 64KB, so a long chapter goes without it
const KEEPALIVE_LIMIT = 60000;

// `flush`: the page is going away, so ask the browser to let the request outlive it
function savePending(workId, { chapterId, content, contentHtml }, { flush = false } = {}) {
  const body = { content, contentHtml };
  const options = flush ? { keepalive: new TextEncoder().encode(JSON.stringify(body)).length < KEEPALIVE_LIMIT } : undefined;
  return api.put(`/works/${workId}/chapters/${chapterId}`, body, options);
}
