import { useState, useCallback, useEffect } from 'react';
import { api } from '../../utils/api.js';
import CodexSuggestPanel from './CodexSuggestPanel.jsx';
import { InlineField, InlineSelect, InlineTextarea } from './InlineFields.jsx';

const CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

export default function RuleDetail({ workId, rule, onUpdate }) {
  const [r, setR] = useState(rule);
  // The Codex refetches after a flag or edit; show what the server now holds
  useEffect(() => setR(rule), [rule]);

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
          rows={5}
        />
        <InlineTextarea
          label="Description"
          value={r.description}
          onSave={(v) => handleSave('description', v)}
          rows={5}
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
