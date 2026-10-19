import { useState } from 'react';
import { useAI } from '../../hooks/useAI.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import ContextUsed from '../panel/ContextUsed.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

export default function HookGenerator({ workId }) {
  const { loading, error, call } = useAI();
  const { state: editorState } = useEditor();
  const { dispatch } = useUI();
  const [hooks, setHooks] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [context, setContext] = useState(null);

  async function handleGenerate() {
    const result = await call('hooks', {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content?.slice(0, 500), // send first 500 chars for context
    });
    if (result && result.hooks) {
      setHooks(result.hooks);
      setContext(result.context || null);
      setGenerated(true);
    }
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
          onClick={() => dispatch({ type: 'TOGGLE_HOOK_GENERATOR' })}
        >
          ✕
        </button>
      </div>

      {!generated && (
        <button
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
            onClick={() => { setHooks([]); setGenerated(false); }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
