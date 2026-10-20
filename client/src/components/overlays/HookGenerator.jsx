import { useRef, useState } from 'react';
import { useAI } from '../../hooks/useAI.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import ContextUsed from '../panel/ContextUsed.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';

export default function HookGenerator({ workId }) {
  const { loading, error, call } = useAI();
  const { state: editorState } = useEditor();
  const { dispatch } = useUI();
  const [hooks, setHooks] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [context, setContext] = useState(null);
  // Spark (the opener) had focus when the generator mounted; read once, not per render
  const [opener] = useState(() => document.activeElement);
  const generateBtn = useRef(null);
  const firstUse = useRef(null);
  const returnFocus = useReturnFocus();

  async function handleGenerate() {
    const result = await call('hooks', {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content?.slice(0, 500), // send first 500 chars for context
    });
    if (result && result.hooks) {
      // Generate leaves the page as the hooks arrive; the first hook takes focus
      returnFocus(firstUse);
      setHooks(result.hooks);
      setContext(result.context || null);
      setGenerated(true);
    }
  }

  function handleClose() {
    opener?.focus();
    dispatch({ type: 'TOGGLE_HOOK_GENERATOR' });
  }

  function handleTryAgain() {
    returnFocus(generateBtn);
    setHooks([]);
    setGenerated(false);
  }

  function handleUseHook(hook) {
    // Insert hook text into editor by dispatching an input event
    const editorEl = document.querySelector('.editor');
    if (editorEl) {
      editorEl.focus();
      document.execCommand('insertText', false, hook);
    }
    dispatch({ type: 'TOGGLE_HOOK_GENERATOR' });
    setHooks([]);
    setGenerated(false);
  }

  return (
    <div className="hook-generator">
      <div className="hook-generator-header">
        <span className="hook-generator-title">Hook Generator</span>
        <button
          className="hook-generator-close"
          aria-label="Close hook generator"
          onClick={handleClose}
        >
          ✕
        </button>
      </div>

      {!generated && (
        <button
          ref={generateBtn}
          className="btn btn-primary"
          onClick={guardBusy(loading, handleGenerate)}
          {...busyProps(loading)}
        >
          {loading ? 'Generating…' : '✨ Generate 3 Hooks'}
        </button>
      )}

      {error && <p className="panel-error">{error}</p>}

      {hooks.length > 0 && (
        <div className="hook-generator-results">
          {hooks.map((hook, i) => (
            <div key={i} className="hook-generator-card">
              <p className="hook-generator-text">{hook}</p>
              <button
                ref={i === 0 ? firstUse : undefined}
                className="btn btn-ghost btn-sm"
                onClick={() => handleUseHook(hook)}
              >
                Use this hook
              </button>
            </div>
          ))}
          <ContextUsed context={context} />
          <button
            className="btn btn-ghost btn-sm hook-regenerate"
            onClick={handleTryAgain}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
