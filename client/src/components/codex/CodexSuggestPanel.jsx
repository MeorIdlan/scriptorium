import { useState } from 'react';
import { useAI } from '../../hooks/useAI.js';

export default function CodexSuggestPanel({ entityType, entity }) {
  const { loading, error, call } = useAI();
  const [suggestions, setSuggestions] = useState(null);

  async function handleSuggest() {
    setSuggestions(null);
    const data = await call('codex-suggest', { entityType, entity });
    if (data?.suggestions) {
      setSuggestions(data.suggestions);
    }
  }

  function handleDismiss() {
    setSuggestions(null);
  }

  return (
    <div className="codex-suggest-panel">
      {!suggestions && (
        <button
          className="btn btn-ghost codex-suggest-trigger"
          onClick={handleSuggest}
          disabled={loading}
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
            <button className="codex-suggest-dismiss" onClick={handleDismiss}>✕</button>
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
          <button
            className="btn btn-ghost codex-suggest-trigger"
            style={{ marginTop: '0.75rem' }}
            onClick={handleSuggest}
            disabled={loading}
          >
            {loading ? 'Thinking…' : '↻ Regenerate'}
          </button>
        </>
      )}
    </div>
  );
}
