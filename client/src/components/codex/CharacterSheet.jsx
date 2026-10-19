import { useState, useCallback, useRef } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { api } from '../../utils/api.js';
import FlagList from './FlagList.jsx';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';

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
          rows={4}
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

export default function CharacterSheet({ workId, character, onUpdate, onFlagsChange }) {
  const [char, setChar] = useState(character);

  const handleSave = useCallback(async (field, value) => {
    const updates = { [field]: value };
    try {
      const updated = await api.put(
        `/works/${workId}/codex/characters/${char.id}`,
        updates
      );
      const merged = { ...char, ...updates };
      setChar(merged);
      onUpdate && onUpdate(merged);
    } catch (err) {
      console.error('Save character failed:', err);
    }
  }, [workId, char, onUpdate]);

  const handlePhysicalSave = useCallback(async (field, value) => {
    const physical = { ...(char.physical || {}), [field]: value };
    await handleSave('physical', physical);
  }, [char, handleSave]);

  return (
    <div className="character-sheet">
      <h3 className="codex-entry-title">{char.name}</h3>

      <div className="codex-entry-fields">
        <InlineField label="Name" value={char.name} onSave={(v) => handleSave('name', v)} />
        <InlineField label="Role" value={char.role} onSave={(v) => handleSave('role', v)} />
        <InlineField label="Aliases" value={char.aliases} onSave={(v) => handleSave('aliases', v)} />
        <InlineField label="Rank" value={char.rank} onSave={(v) => handleSave('rank', v)} />
        <InlineField label="Affiliations" value={char.affiliations} onSave={(v) => handleSave('affiliations', v)} />
        <InlineField label="First Appearance" value={char.firstAppearance} onSave={(v) => handleSave('firstAppearance', v)} />

        <div className="codex-section-divider">Physical</div>
        <InlineField
          label="Eye Color"
          value={char.physical?.eyeColor}
          onSave={(v) => handlePhysicalSave('eyeColor', v)}
        />
        <InlineField
          label="Hair Color"
          value={char.physical?.hairColor}
          onSave={(v) => handlePhysicalSave('hairColor', v)}
        />
        <InlineField
          label="Build"
          value={char.physical?.build}
          onSave={(v) => handlePhysicalSave('build', v)}
        />

        <div className="codex-section-divider">Notes</div>
        <InlineTextarea
          label="Notes"
          value={char.notes}
          onSave={(v) => handleSave('notes', v)}
        />
      </div>

      <FlagList
        workId={workId}
        flags={(char.flags || []).filter((f) => f.status === 'unresolved')}
        entityType="character"
        entityId={char.id}
        onFlagsChange={onFlagsChange}
      />

      <CodexSuggestPanel workId={workId} entityType="character" entity={char} />
    </div>
  );
}
