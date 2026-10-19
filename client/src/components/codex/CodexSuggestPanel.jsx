import { useState } from 'react';
import { useAI } from '../../hooks/useAI.js';
import { useAiState } from '../../context/AiContext.jsx';
import ContextUsed from '../panel/ContextUsed.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

export default function CodexSuggestPanel({ workId, entityType, entity }) {
  const { loading, error, call } = useAI();
  const [suggestions, setSuggestions] = useState(null);
  const [context, setContext] = useState(null);
  const { aiOn } = useAiState();

  async function handleSuggest() {
    setSuggestions(null);
    setContext(null);
    const data = await call('codex-suggest', { workId, entityType, entity });
    if (data?.suggestions) {
      setSuggestions(data.suggestions);
      setContext(data.context || null);
    }
  }

  function handleDismiss() {
    setSuggestions(null);
  }

  if (!aiOn) return null;

  return (
    <div className="codex-suggest-panel">
      {!suggestions && (
        <button
          className="btn btn-ghost codex-suggest-trigger"
          onClick={guardBusy(loading, handleSuggest)}
          {...busyProps(loading)}
        >
          {loading ? 'Thinking…' : '◆ AI Suggestions'}
        </button>
      )}

      {error && !loading && (
        <p className="codex-suggest-error">{error}</p>
      )}

      {suggestions && (
        <>
          <div className="codex-suggest-header">
            <span className="codex-suggest-label">AI Suggestions</span>
            <button className="codex-suggest-dismiss" aria-label="Dismiss suggestions" onClick={handleDismiss}>✕</button>
          </div>
          <div className="codex-suggest-list">
            {suggestions.map((s, i) => (
              <div key={i} className="codex-suggest-item">
                {s.field && (
                  <p className="codex-suggest-field">{s.field}</p>
                )}
                <p className="codex-suggest-text">{s.text}</p>
              </div>
            ))}
          </div>
          <ContextUsed context={context} />
          <button
            className="btn btn-ghost codex-suggest-trigger"
            style={{ marginTop: '0.75rem' }}
            onClick={guardBusy(loading, handleSuggest)}
            {...busyProps(loading)}
          >
            {loading ? 'Thinking…' : '↻ Regenerate'}
          </button>
        </>
      )}
    </div>
  );
}
