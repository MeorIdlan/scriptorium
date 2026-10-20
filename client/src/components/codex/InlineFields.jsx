import { useState, useRef } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';

export function InlineField({ label, value, onSave, valueRef }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ownValueBtn = useRef(null);
  const valueBtn = valueRef || ownValueBtn;
  const returnFocus = useReturnFocus();

  function handleKey(e) {
    if (e.key === 'Enter') {
      // Claim the key: the value button returns focus to would otherwise be clicked by this same Enter
      e.preventDefault();
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
          type="text"
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

export function InlineTextarea({ label, value, onSave, rows = 4 }) {
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
          rows={rows}
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

export function InlineSelect({ label, value, options, onSave }) {
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
      // Claim the key: the value button returns focus to would otherwise be clicked by this same Enter
      e.preventDefault();
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
