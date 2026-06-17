import { useMemo } from 'react';
import { countWords } from '../utils/wordCount.js';

export function useWordCount(text) {
  return useMemo(() => countWords(text), [text]);
}

export function useChapterWordCounts(chapters) {
  return useMemo(() => {
    if (!chapters || chapters.length === 0) return 0;
    return chapters.reduce((total, ch) => total + (ch.wordCount || 0), 0);
  }, [chapters]);
}
