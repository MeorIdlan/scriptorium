import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../../utils/api.js';
import FlagList from './FlagList.jsx';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';
import { InlineField, InlineTextarea } from './InlineFields.jsx';

export default function CharacterSheet({ workId, character, onUpdate, onFlagsChange }) {
  const [char, setChar] = useState(character);
  // The Name value is the sheet's first field: where focus goes when the last flag leaves
  const nameBtn = useRef(null);
  // The Codex refetches after a flag or edit; show what the server now holds
  useEffect(() => setChar(character), [character]);

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
        <InlineField label="Name" value={char.name} onSave={(v) => handleSave('name', v)} valueRef={nameBtn} />
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
        fallback={nameBtn}
      />

      <CodexSuggestPanel workId={workId} entityType="character" entity={char} />
    </div>
  );
}
