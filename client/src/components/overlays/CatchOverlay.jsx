import { useId, useState, useEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { api } from '../../utils/api.js';
import { chapterLabel, catchLengthError } from '../../utils/catchGroups.js';
import { useModal } from '../../hooks/useModal.js';

// Mounted only while open, so the dialog's focus handling runs per open
export default function CatchOverlay() {
  const { state } = useUI();
  if (!state.catchOverlayOpen) return null;
  return <CatchDialog />;
}

function CatchDialog() {
  const { state, dispatch } = useUI();
  const { state: editorState } = useEditor();
  const { state: workState, refreshCatches } = useActiveWork();

  const [text, setText] = useState('');
  const [chapterTag, setChapterTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  // A corner panel, not a modal: Tab leaves it for the editor
  const titleId = useId();
  const { dialogProps } = useModal({
    onClose: () => dispatch({ type: 'CLOSE_CATCH' }),
    initialFocusRef: inputRef,
    trap: false,
  });

  // Esc closes from anywhere in the window, as before the panel used the hook.
  // A press inside the panel is already handled (preventDefault) and skipped
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && !e.defaultPrevented) dispatch({ type: 'CLOSE_CATCH' });
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dispatch]);

  const workId = workState.work?.id;

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (state.catchOverlayOpen) {
      setText('');
      setError('');
      setChapterTag(editorState.chapterId || '');
    }
  }, [state.catchOverlayOpen, editorState.chapterId]);

  async function handleSubmit() {
    if (!text.trim() || !workId || catchLengthError(text)) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/works/${workId}/catches`, {
        content: text.trim(),
        capturedDuringChapterId: editorState.chapterId || null,
        taggedChapterId: chapterTag || null,
      });
      refreshCatches(workId);
      dispatch({ type: 'CLOSE_CATCH' });
      setText('');
    } catch (err) {
      console.error('Catch submission failed:', err);
      setError(err.message || 'Could not save the catch.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const chapters = workState.chapters || [];
  const currentChapter = chapters.find((ch) => ch.id === editorState.chapterId);

  return (
    <div className="catch-overlay" aria-labelledby={titleId} {...dialogProps}>
      <div className="catch-overlay-header">
        <span id={titleId} className="catch-overlay-title">Catch an Idea</span>
        <button
          className="catch-overlay-close" aria-label="Close"
          onClick={() => dispatch({ type: 'CLOSE_CATCH' })}
        >
          ✕
        </button>
      </div>

      <textarea
        ref={inputRef}
        className="catch-overlay-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What's the idea? (Enter to catch)"
        rows={3}
      />

      {(catchLengthError(text) || error) && (
        <p className="catch-row-error">{catchLengthError(text) || error}</p>
      )}

      <div className="catch-overlay-footer">
        <select
          className="form-select catch-chapter-select"
          value={chapterTag}
          onChange={(e) => setChapterTag(e.target.value)}
        >
          <option value="">No chapter tag</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {chapterLabel(ch)}
            </option>
          ))}
        </select>

        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={submitting || !text.trim() || Boolean(catchLengthError(text))}
        >
          {submitting ? 'Catching…' : 'Catch it'}
        </button>
      </div>
    </div>
  );
}
