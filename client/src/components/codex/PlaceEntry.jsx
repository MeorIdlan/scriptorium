import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../../utils/api.js';
import FlagList from './FlagList.jsx';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';
import { InlineField, InlineTextarea } from './InlineFields.jsx';

export default function PlaceEntry({ workId, place, onUpdate, onFlagsChange }) {
  const [entry, setEntry] = useState(place);
  // The Name value is the entry's first field: where focus goes when the last flag leaves
  const nameBtn = useRef(null);
  // The Codex refetches after a flag or edit; show what the server now holds
  useEffect(() => setEntry(place), [place]);

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
        <InlineField label="Name" value={entry.name} onSave={(v) => handleSave('name', v)} valueRef={nameBtn} />
        <InlineTextarea label="Description" value={entry.description} onSave={(v) => handleSave('description', v)} />
        <InlineField label="First Appearance" value={entry.firstAppearance} onSave={(v) => handleSave('firstAppearance', v)} />
        <InlineTextarea label="Notes" value={entry.notes} onSave={(v) => handleSave('notes', v)} />
      </div>

      <FlagList
        workId={workId}
        flags={(entry.flags || []).filter((f) => f.status === 'unresolved')}
        entityType="place"
        entityId={entry.id}
        onFlagsChange={onFlagsChange}
        fallback={nameBtn}
      />

      <CodexSuggestPanel workId={workId} entityType="place" entity={entry} />
    </div>
  );
}
