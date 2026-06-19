import { useState, useCallback } from 'react';
import { api } from '../../utils/api.js';
import FlagList from './FlagList.jsx';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';

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
          rows={4}
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

export default function PlaceEntry({ workId, place, onUpdate, onFlagsChange }) {
  const [entry, setEntry] = useState(place);

  const handleSave = useCallback(async (field, value) => {
    try {
      const updated = await api.put(
        `/works/${workId}/codex/places/${entry.id}`,
        { [field]: value }
      );
      const merged = { ...entry, [field]: value };
      setEntry(merged);
      onUpdate && onUpdate(merged);
    } catch (err) {
      console.error('Save place failed:', err);
    }
  }, [workId, entry, onUpdate]);

  return (
    <div className="place-entry">
      <h3 className="codex-entry-title">{entry.name}</h3>

      <div className="codex-entry-fields">
        <InlineField label="Name" value={entry.name} onSave={(v) => handleSave('name', v)} />
        <InlineTextarea label="Description" value={entry.description} onSave={(v) => handleSave('description', v)} />
        <InlineField label="First Appearance" value={entry.firstAppearance} onSave={(v) => handleSave('firstAppearance', v)} />
        <InlineTextarea label="Notes" value={entry.notes} onSave={(v) => handleSave('notes', v)} />
      </div>

      <FlagList
        workId={workId}
        flags={(entry.flags || []).filter((f) => f.status === 'open')}
        entityType="place"
        entityId={entry.id}
        onFlagsChange={onFlagsChange}
      />

      <CodexSuggestPanel entityType="place" entity={entry} />
    </div>
  );
}
