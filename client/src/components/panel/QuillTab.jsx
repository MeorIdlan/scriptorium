import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAI } from '../../hooks/useAI.js';
import { api } from '../../utils/api.js';
import HookGenerator from '../overlays/HookGenerator.jsx';
import DraftPolishModal from '../overlays/DraftPolishModal.jsx';
import EditorReviewModal from '../overlays/EditorReviewModal.jsx';

function RekindlerCard({ snapshot, onDismiss }) {
  const previewText = snapshot?.summary || snapshot?.excerpt || snapshot?.lastScene || 'No summary available.';
  return (
    <div className="rekindler-card">
      <div className="rekindler-header">
        <span className="rekindler-label">Where you left off</span>
        <button className="rekindler-dismiss" onClick={onDismiss}>✕</button>
      </div>
      <p className="rekindler-text">{previewText}</p>
      {snapshot?.toneNote && <p className="rekindler-text rekindler-tone">{snapshot.toneNote}</p>}
      {snapshot?.lastSaved && (
        <p className="rekindler-time">
          {new Date(snapshot.lastSaved).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function RekindlerPromptModal({ onConfirm, onDismiss, loading }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal rekindler-prompt-modal">
        <div className="modal-header">
          <span className="modal-title">Rekindle your session?</span>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>
        <div className="modal-body">
          <p className="rekindler-prompt-body">
            You have no saved session for this work. Would you like the AI to summarise where you left off — the last scene, emotional tone, and character mood?
          </p>
        </div>
        <div className="modal-footer rekindler-prompt-footer">
          <button className="btn btn-ghost" onClick={onDismiss} disabled={loading}>
            Not now
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Rekindling…' : 'Yes, rekindle'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function QuillTab({ workId }) {
  const { state: uiState } = useUI();
  const { state: editorState } = useEditor();
  const { loading, error, result, call, reset } = useAI();

  const [snapshot, setSnapshot] = useState(null);
  const [showRekindler, setShowRekindler] = useState(false);
  const [showRekindlerPrompt, setShowRekindlerPrompt] = useState(false);
  const [rekindlerLoading, setRekindlerLoading] = useState(false);
  const [aiAction, setAiAction] = useState(null);
  const [polishedDraft, setPolishedDraft] = useState(null);
  const [editorReview, setEditorReview] = useState(null);

  useEffect(() => {
    if (!workId) return;
    const seenKey = `rekindler_seen_${workId}`;
    if (sessionStorage.getItem(seenKey)) return;

    let cancelled = false;

    async function init() {
      const [sessionResult, settingsResult] = await Promise.allSettled([
        api.get(`/works/${workId}/sessions/latest`),
        api.get('/settings'),
      ]);

      if (cancelled) return;

      const rekindlerPref = settingsResult.value?.autoFeatures?.rekindler ?? 'prompt';

      if (sessionResult.status === 'fulfilled' && sessionResult.value) {
        const savedAt = sessionResult.value.lastSaved
          ? new Date(sessionResult.value.lastSaved)
          : null;
        const staleMinutes = savedAt
          ? (Date.now() - savedAt.getTime()) / 60000
          : Infinity;
        if (staleMinutes > 30) {
          sessionStorage.setItem(seenKey, '1');
          setSnapshot(sessionResult.value);
          setShowRekindler(true);
        }
      } else {
        if (rekindlerPref === 'never') return;
        sessionStorage.setItem(seenKey, '1');
        if (rekindlerPref === 'auto') {
          try {
            const data = await api.post('/ai/rekindler', { workId });
            if (!cancelled && data) {
              setSnapshot(data);
              setShowRekindler(true);
            }
          } catch {}
        } else {
          setShowRekindlerPrompt(true);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [workId]);

  async function handleRekindlerConfirm() {
    setRekindlerLoading(true);
    try {
      const data = await api.post('/ai/rekindler', { workId });
      if (data) {
        setSnapshot(data);
        setShowRekindlerPrompt(false);
        setShowRekindler(true);
      }
    } catch {
      setShowRekindlerPrompt(false);
    } finally {
      setRekindlerLoading(false);
    }
  }

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
      {showRekindlerPrompt && (
        <RekindlerPromptModal
          onConfirm={handleRekindlerConfirm}
          onDismiss={() => setShowRekindlerPrompt(false)}
          loading={rekindlerLoading}
        />
      )}

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
