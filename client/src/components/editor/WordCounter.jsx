import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useWordCount, useChapterWordCounts } from '../../hooks/useWordCount.js';
import { formatNumber } from '../../utils/wordCount.js';
import { useDailyProgress } from '../../hooks/useDailyProgress.js';
import { progressView } from '../../utils/dailyProgress.js';

export default function WordCounter() {
  const { state: editorState } = useEditor();
  const { state: workState } = useActiveWork();

  const chapterWords = useWordCount(editorState.content);
  const totalWords = useChapterWordCounts(workState.chapters);
  const daily = progressView(
    useDailyProgress(chapterWords, editorState.saveStatus, editorState.chapterId)
  );

  const currentChapter = workState.chapters.find(
    (ch) => ch.id === editorState.chapterId
  );

  return (
    <div className="word-counter">
      {currentChapter && (
        <span>Ch. {currentChapter.number} — {formatNumber(chapterWords)} words</span>
      )}
      {!currentChapter && chapterWords > 0 && (
        <span>{formatNumber(chapterWords)} words</span>
      )}
      {totalWords > 0 && (
        <span className="word-counter-total"> · Total: {formatNumber(totalWords)} words</span>
      )}
      {daily && (
        <span className="word-counter-daily">
          {' · '}{daily.text}
          {daily.percent !== null && (
            <span className="word-counter-bar" aria-hidden="true">
              <span style={{ width: `${daily.percent}%` }} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}
