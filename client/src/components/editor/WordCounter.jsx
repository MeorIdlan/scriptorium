import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useWordCount, useChapterWordCounts } from '../../hooks/useWordCount.js';
import { formatNumber } from '../../utils/wordCount.js';

export default function WordCounter() {
  const { state: editorState } = useEditor();
  const { state: workState } = useActiveWork();

  const chapterWords = useWordCount(editorState.content);
  const totalWords = useChapterWordCounts(workState.chapters);

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
    </div>
  );
}
