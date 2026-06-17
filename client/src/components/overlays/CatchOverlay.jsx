import { useState, useEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { api } from '../../utils/api.js';

export default function CatchOverlay() {
  const { state, dispatch } = useUI();
  const { state: editorState } = useEditor();
  const { state: workState, refreshCatches } = useActiveWork();

  const [text, setText] = useState('');
  const [chapterTag, setChapterTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  const workId = workState.work?.id;

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (state.catchOverlayOpen) {
      setText('');
      setChapterTag(editorState.chapterId || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state.catchOverlayOpen, editorState.chapterId]);

  // Escape to close
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && state.catchOverlayOpen) {
        dispatch({ type: 'CLOSE_CATCH' });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.catchOverlayOpen, dispatch]);

  async function handleSubmit() {
    if (!text.trim() || !workId) return;
    setSubmitting(true);
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

  if (!state.catchOverlayOpen) return null;

  return (
    <div className="catch-overlay">
      <div className="catch-overlay-header">
        <span className="catch-overlay-title">Catch an Idea</span>
        <button
          className="catch-overlay-close"
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

      <div className="catch-overlay-footer">
        <select
          className="form-select catch-chapter-select"
          value={chapterTag}
          onChange={(e) => setChapterTag(e.target.value)}
        >
          <option value="">No chapter tag</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              Ch. {ch.number} — {ch.title || 'Untitled'}
            </option>
          ))}
        </select>

        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
        >
          {submitting ? 'Catching…' : 'Catch it'}
        </button>
      </div>
    </div>
  );
}
