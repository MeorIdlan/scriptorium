import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAI } from '../../hooks/useAI.js';
import { api } from '../../utils/api.js';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import PacingResult from './PacingResult.jsx';
import ContextUsed from './ContextUsed.jsx';
import { summaryRefreshPending, loadingLabel } from '../../utils/summaryStatus.js';
import HookGenerator from '../overlays/HookGenerator.jsx';
import PolishReviewModal from '../overlays/PolishReviewModal.jsx';
import { getBlocks, chapterTargets, selectionTargets, batchTargets } from '../../utils/editorBlocks.js';
import EditorReviewModal from '../overlays/EditorReviewModal.jsx';

function RekindlerCard({ snapshot, lastSessionAt, onDismiss }) {
  return (
    <div className="rekindler-card">
      <div className="rekindler-header">
        <span className="rekindler-label">Where you left off</span>
        <button className="rekindler-dismiss" onClick={onDismiss}>✕</button>
      </div>
      <p className="rekindler-text">{snapshot.lastScene || 'No summary available.'}</p>
      {snapshot.toneNote && <p className="rekindler-text rekindler-tone">{snapshot.toneNote}</p>}
      {snapshot.characterMood && <p className="rekindler-text rekindler-tone">{snapshot.characterMood}</p>}
      {snapshot.voiceSample && <p className="rekindler-text rekindler-tone">“{snapshot.voiceSample}”</p>}
      {lastSessionAt && (
        <p className="rekindler-time">
          Last session {new Date(lastSessionAt).toLocaleString()}
        </p>
      )}
      <ContextUsed context={snapshot.context} />
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
            Welcome back. Would you like the AI to summarise where you left off — the last scene, emotional tone, and character mood?
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
  const { state: workState } = useActiveWork();
  const { loading, error, result, call, reset } = useAI();

  const [snapshot, setSnapshot] = useState(null);
  const [lastSessionAt, setLastSessionAt] = useState(null);
  const [showRekindler, setShowRekindler] = useState(false);
  const [showRekindlerPrompt, setShowRekindlerPrompt] = useState(false);
  const [rekindlerLoading, setRekindlerLoading] = useState(false);
  const [aiAction, setAiAction] = useState(null);
  const [polishSession, setPolishSession] = useState(null);
  const [polishResult, setPolishResult] = useState(null);
  const [editorReview, setEditorReview] = useState(null);

  useEffect(() => {
    if (!workId) return;
    const seenKey = `rekindler_seen_${workId}`;
    if (sessionStorage.getItem(seenKey)) return;

    let cancelled = false;

    async function init() {
      const [sessionResult, settingsResult, workResult] = await Promise.allSettled([
        api.get(`/works/${workId}/sessions/latest?ended=true`),
        api.get('/settings'),
        api.get(`/works/${workId}`),
      ]);

      if (cancelled) return;
      // Nothing written yet, so nothing to rekindle
      if (!workResult.value?.wordCount) return;

      const rekindlerPref = settingsResult.value?.autoFeatures?.rekindler ?? 'prompt';
      const lastSession = sessionResult.status === 'fulfilled' ? sessionResult.value : null;

      // Only rekindle after a break: no previous session, or one that ended 30+ min ago
      if (lastSession?.endedAt) {
        const staleMinutes = (Date.now() - new Date(lastSession.endedAt).getTime()) / 60000;
        if (staleMinutes < 30) return;
        setLastSessionAt(lastSession.endedAt);
      }

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

  function handlePolish() {
    const editorEl = document.querySelector('.editor');
    if (!editorEl) return;
    const blocks = getBlocks(editorEl);
    const mode = editorState.selection ? 'selection' : 'chapter';
    const targets = mode === 'selection' ? selectionTargets(blocks, editorState.selection) : chapterTargets(blocks);
    if (targets.length === 0) return;
    setPolishResult(null);
    setPolishSession({
      mode,
      batches: batchTargets(targets),
      blockTexts: blocks.map((b) => b.text),
      chapterText: editorState.content,
    });
  }


  async function handleEditorReview(mode) {
    if (!editorState.content?.trim()) return;
    setAiAction(`editor-${mode}`);
    reset();
    setEditorReview(null);
    const data = await call('editor-review', {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content,
      mode,
    });
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
        <RekindlerCard
          snapshot={snapshot}
          lastSessionAt={lastSessionAt}
          onDismiss={() => setShowRekindler(false)}
        />
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
          ⟳ How is the story pacing?
        </button>
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--polish"
          onClick={handlePolish}
          disabled={loading || Boolean(polishSession) || !editorState.content?.trim()}
          title="Suggests rewrites you can accept or reject one by one, keeping the story direction unchanged"
        >
          ✦ Polish {editorState.selection ? 'selection' : 'chapter'}
        </button>
      </div>

      {polishResult && (
        <p className="polish-notice">
          Applied {polishResult.applied} change{polishResult.applied === 1 ? '' : 's'}
          {polishResult.skipped > 0 && ` · ${polishResult.skipped} skipped because the text changed`}
        </p>
      )}

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

      {loading && (
        <p className="panel-loading">
          {loadingLabel(
            summaryRefreshPending(workState.chapters, editorState.chapterId, aiAction === 'pacing' ? 'all' : 'before')
          )}
        </p>
      )}
      {error && <p className="panel-error">{error}</p>}
      {result && !uiState.hookGeneratorOpen && (
        <div className="ai-result">
          {aiAction === 'pacing' && (
            <PacingResult result={result} chapters={workState.chapters} />
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
          {(aiAction === 'pacing' || aiAction === 'hooks') && <ContextUsed context={result.context} />}
        </div>
      )}

      {uiState.hookGeneratorOpen && (
        <HookGenerator workId={workId} />
      )}

      {polishSession && (
        <PolishReviewModal
          workId={workId}
          chapterId={editorState.chapterId}
          session={polishSession}
          summariesPending={summaryRefreshPending(workState.chapters, editorState.chapterId, 'before')}
          onClose={(result) => {
            setPolishSession(null);
            setPolishResult(result);
          }}
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
