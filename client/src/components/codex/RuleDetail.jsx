import { useState, useCallback } from 'react';
import { api } from '../../utils/api.js';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';

const CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

function InlineSelect({ label, value, options, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || options[0]);

  function handleChange(e) {
    const v = e.target.value;
    setDraft(v);
    setEditing(false);
    if (v !== value) onSave(v);
  }

  return (
    <div className="inline-field">
      <span className="inline-field-label">{label}</span>
      {editing ? (
        <select
          className="inline-field-select"
          value={draft}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          autoFocus
        >
          {options.map((o) => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>
      ) : (
        <span
          className="inline-field-value"
          onClick={() => { setDraft(value || options[0]); setEditing(true); }}
          title="Click to edit"
        >
          {value
            ? value.charAt(0).toUpperCase() + value.slice(1)
            : <em className="inline-field-placeholder">—</em>}
        </span>
      )}
    </div>
  );
}

function InlineTextarea({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  function handleSave() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  return (
    <div className="inline-field">
      <span className="inline-field-label">{label}</span>
      {editing ? (
        <textarea
          className="inline-field-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          autoFocus
          rows={5}
        />
      ) : (
        <span
          className="inline-field-value"
          onClick={() => { setDraft(value || ''); setEditing(true); }}
          title="Click to edit"
        >
          {value || <em className="inline-field-placeholder">—</em>}
        </span>
      )}
    </div>
  );
}

function InlineField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  function handleKey(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  }

  function handleSave() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  return (
    <div className="inline-field">
      <span className="inline-field-label">{label}</span>
      {editing ? (
        <input
          className="inline-field-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={handleSave}
          autoFocus
        />
      ) : (
        <span
          className="inline-field-value"
          onClick={() => { setDraft(value || ''); setEditing(true); }}
          title="Click to edit"
        >
          {value || <em className="inline-field-placeholder">—</em>}
        </span>
      )}
    </div>
  );
}

export default function RuleDetail({ workId, rule, onUpdate }) {
  const [r, setR] = useState(rule);

  const handleSave = useCallback(async (field, value) => {
    try {
      await api.put(`/works/${workId}/codex/rules/${r.id}`, { [field]: value });
      const updated = { ...r, [field]: value };
      setR(updated);
      onUpdate && onUpdate(updated);
    } catch (err) {
      console.error('Save rule failed:', err);
    }
  }, [workId, r, onUpdate]);

  const title = r.rule ? (r.rule.length > 60 ? r.rule.slice(0, 60) + '…' : r.rule) : 'Rule';

  return (
    <div className="rule-detail">
      <h3 className="codex-entry-title">{title}</h3>

      <div className="codex-entry-fields">
        <InlineSelect
          label="Category"
          value={r.category || 'other'}
          options={CATEGORIES}
          onSave={(v) => handleSave('category', v)}
        />
        <InlineTextarea
          label="Rule"
          value={r.rule}
          onSave={(v) => handleSave('rule', v)}
        />
        <InlineTextarea
          label="Description"
          value={r.description}
          onSave={(v) => handleSave('description', v)}
        />
        <InlineField
          label="Established In"
          value={r.establishedIn}
          onSave={(v) => handleSave('establishedIn', v)}
        />
      </div>

      <CodexSuggestPanel entityType="worldRule" entity={r} />
    </div>
  );
}
