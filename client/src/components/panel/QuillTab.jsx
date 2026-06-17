import { useEffect, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAI } from '../../hooks/useAI.js';
import { api } from '../../utils/api.js';
import HookGenerator from '../overlays/HookGenerator.jsx';
import DraftPolishModal from '../overlays/DraftPolishModal.jsx';
import EditorReviewModal from '../overlays/EditorReviewModal.jsx';

function RekindlerCard({ snapshot, onDismiss }) {
  const previewText = snapshot?.summary || snapshot?.excerpt || 'No summary available.';
  return (
    <div className="rekindler-card">
      <div className="rekindler-header">
        <span className="rekindler-label">Where you left off</span>
        <button className="rekindler-dismiss" onClick={onDismiss}>✕</button>
      </div>
      <p className="rekindler-text">{previewText}</p>
      {snapshot?.lastSaved && (
        <p className="rekindler-time">
          {new Date(snapshot.lastSaved).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default function QuillTab({ workId }) {
  const { state: uiState } = useUI();
  const { state: editorState } = useEditor();
  const { loading, error, result, call, reset } = useAI();

  const [snapshot, setSnapshot] = useState(null);
  const [showRekindler, setShowRekindler] = useState(false);
  const [aiAction, setAiAction] = useState(null);
  const [polishedDraft, setPolishedDraft] = useState(null);
  const [editorReview, setEditorReview] = useState(null);

  useEffect(() => {
    if (!workId) return;
    api.get(`/works/${workId}/sessions/latest`)
      .then((data) => {
        if (!data) return;
        const savedAt = data.lastSaved ? new Date(data.lastSaved) : null;
        const staleMinutes = savedAt
          ? (Date.now() - savedAt.getTime()) / 60000
          : Infinity;
        if (staleMinutes > 30) {
          setSnapshot(data);
          setShowRekindler(true);
        }
      })
      .catch(() => {
        // No session yet — attempt rekindler generation
        if (workId) {
          api.post(`/ai/rekindler`, { workId })
            .then((data) => {
              if (data) {
                setSnapshot(data);
                setShowRekindler(true);
              }
            })
            .catch(() => {});
        }
      });
  }, [workId]);

  async function handleAI(action, endpoint) {
    setAiAction(action);
    reset();
    await call(endpoint, {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content,
    });
  }

  async function handlePolishDraft() {
    if (!editorState.content?.trim()) return;
    setAiAction('polish');
    reset();
    setPolishedDraft(null);
    const data = await call('polish-draft', { content: editorState.content });
    if (data?.polished) {
      setPolishedDraft(data.polished);
    }
  }

  async function handleEditorReview(mode) {
    if (!editorState.content?.trim()) return;
    setAiAction(`editor-${mode}`);
    reset();
    setEditorReview(null);
    const data = await call('editor-review', { content: editorState.content, mode });
    if (data) {
      setEditorReview(data);
    }
  }

  return (
    <div className="quill-tab">
      {showRekindler && snapshot && (
        <RekindlerCard snapshot={snapshot} onDismiss={() => setShowRekindler(false)} />
      )}

      <div className="quill-actions">
        <p className="quill-actions-label">AI Assist</p>
        <button
          className="btn btn-ghost quill-ai-btn"
          onClick={() => handleAI('hooks', 'hooks')}
          disabled={loading}
        >
          ✨ Suggest 3 hooks for this scene
        </button>
        <button
          className="btn btn-ghost quill-ai-btn"
          onClick={() => handleAI('pacing', 'pacing')}
          disabled={loading}
        >
          ⟳ How is this scene pacing?
        </button>
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--polish"
          onClick={handlePolishDraft}
          disabled={loading || !editorState.content?.trim()}
          title="Rewrites the draft with better grammar and description, keeping the story direction unchanged"
        >
          ✦ Polish this draft
        </button>
      </div>

      <div className="quill-actions">
        <p className="quill-actions-label">AI Editor</p>
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--editor"
          onClick={() => handleEditorReview('full')}
          disabled={loading || !editorState.content?.trim()}
          title="Full editorial read-through: prose, pacing, scene effectiveness, dialogue"
        >
          ◆ Editorial read-through
        </button>
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--editor"
          onClick={() => handleEditorReview('show-tell')}
          disabled={loading || !editorState.content?.trim()}
          title="Flags passages that tell rather than show, with rewrite suggestions"
        >
          ◈ Show, don't tell check
        </button>
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--editor"
          onClick={() => handleEditorReview('voice')}
          disabled={loading || !editorState.content?.trim()}
          title="Checks POV consistency, tense, passive voice, adverb overuse"
        >
          ◇ Voice &amp; consistency
        </button>
      </div>

      {loading && <p className="panel-loading">Thinking…</p>}
      {error && <p className="panel-error">{error}</p>}
      {result && !uiState.hookGeneratorOpen && (
        <div className="ai-result">
          {aiAction === 'pacing' && (
            <p className="ai-result-text">{result.analysis || result.text || JSON.stringify(result)}</p>
          )}
          {aiAction === 'hooks' && result.hooks && (
            <div className="ai-hooks-list">
              {result.hooks.map((h, i) => (
                <div key={i} className="ai-hook-item">
                  <p>{h}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {uiState.hookGeneratorOpen && (
        <HookGenerator workId={workId} />
      )}

      {polishedDraft && (
        <DraftPolishModal
          polished={polishedDraft}
          onDismiss={() => setPolishedDraft(null)}
        />
      )}

      {editorReview && (
        <EditorReviewModal
          review={editorReview}
          onDismiss={() => setEditorReview(null)}
        />
      )}
    </div>
  );
}
