import { useState, useCallback, useRef } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { api } from '../../utils/api.js';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';

const CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

function InlineSelect({ label, value, options, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || options[0]);
  const valueBtn = useRef(null);
  const returnFocus = useReturnFocus();

  // A change only picks the option: the field closes on Enter or on blur, so the
  // arrow keys can move through the list. Esc drops the pick.
  function handleSave() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKey(e) {
    if (e.key === 'Enter') {
      returnFocus(valueBtn);
      handleSave();
    }
    if (e.key === 'Escape') {
      returnFocus(valueBtn);
      setEditing(false);
    }
  }

  return (
    <div className="inline-field">
      <span className="inline-field-label">{label}</span>
      {editing ? (
        <select
          className="inline-field-select"
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={handleSave}
          autoFocus
        >
          {options.map((o) => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>
      ) : (
        <button type="button"
          ref={valueBtn}
          className="inline-field-value"
          aria-label={`${label}: ${value || 'empty'}`}
          onClick={() => { setDraft(value || options[0]); setEditing(true); }}
          title="Click to edit"
        >
          {value
            ? value.charAt(0).toUpperCase() + value.slice(1)
            : <em className="inline-field-placeholder">—</em>}
        </button>
      )}
    </div>
  );
}

function InlineTextarea({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const valueBtn = useRef(null);
  const returnFocus = useReturnFocus();

  // Enter is a new line here, so Esc is the keyboard way out: it drops the draft
  function handleKey(e) {
    if (e.key === 'Escape') {
      returnFocus(valueBtn);
      setEditing(false);
    }
  }

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
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={handleSave}
          autoFocus
          rows={5}
        />
      ) : (
        <button type="button"
          ref={valueBtn}
          className="inline-field-value"
          aria-label={`${label}: ${value || 'empty'}`}
          onClick={() => { setDraft(value || ''); setEditing(true); }}
          title="Click to edit"
        >
          {value || <em className="inline-field-placeholder">—</em>}
        </button>
      )}
    </div>
  );
}

function InlineField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const valueBtn = useRef(null);
  const returnFocus = useReturnFocus();

  function handleKey(e) {
    if (e.key === 'Enter') {
      returnFocus(valueBtn);
      handleSave();
    }
    if (e.key === 'Escape') {
      returnFocus(valueBtn);
      setEditing(false);
    }
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
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={handleSave}
          autoFocus
        />
      ) : (
        <button type="button"
          ref={valueBtn}
          className="inline-field-value"
          aria-label={`${label}: ${value || 'empty'}`}
          onClick={() => { setDraft(value || ''); setEditing(true); }}
          title="Click to edit"
        >
          {value || <em className="inline-field-placeholder">—</em>}
        </button>
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

      <CodexSuggestPanel workId={workId} entityType="worldRule" entity={r} />
    </div>
  );
}
