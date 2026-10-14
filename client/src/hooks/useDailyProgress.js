import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';
import { pendingGain } from '../utils/dailyProgress.js';

// The status string useAutosave sets after a successful save (EditorContext: 'saved' | 'saving' | 'error')
const SAVED_STATUS = 'saved';

export function useDailyProgress(chapterWords, saveStatus, chapterId) {
  const [server, setServer] = useState({ words: null, goal: null });
  const loadedForRef = useRef(undefined);
  const savedWordsRef = useRef(chapterWords);

  // Reload today's total when the chapter changes or a save completes; ignore 'saving' and 'error' otherwise
  useEffect(() => {
    const chapterChanged = loadedForRef.current !== chapterId;
    if (!chapterChanged && saveStatus !== SAVED_STATUS) return undefined;
    loadedForRef.current = chapterId;
    let cancelled = false;
    api
      .get('/progress/today')
      .then((data) => {
        if (!cancelled) setServer({ words: data.words, goal: data.goal });
      })
      .catch(() => {
        if (!cancelled) setServer({ words: null, goal: null });
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, saveStatus]);

  // The count at the last successful save is the baseline for the unsaved gain
  useEffect(() => {
    savedWordsRef.current = chapterWords;
  }, [chapterId]);

  useEffect(() => {
    if (saveStatus === SAVED_STATUS) savedWordsRef.current = chapterWords;
  }, [saveStatus]);

  return { ...server, pendingGain: pendingGain(chapterWords, savedWordsRef.current) };
}
