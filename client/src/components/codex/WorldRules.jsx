import { useState } from 'react';
import { api } from '../../utils/api.js';

const CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

function RuleItem({ workId, rule, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...rule });

  async function handleSave() {
    try {
      await api.put(`/works/${workId}/codex/rules/${rule.id}`, draft);
      onUpdate({ ...rule, ...draft });
      setEditing(false);
    } catch (err) {
      console.error('Save rule failed:', err);
    }
  }

  if (editing) {
    return (
      <div className="rule-item editing">
        <select
          className="form-select rule-category-select"
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <textarea
          className="form-textarea rule-text-area"
          value={draft.rule}
          onChange={(e) => setDraft((d) => ({ ...d, rule: e.target.value }))}
          rows={3}
          placeholder="Rule text…"
        />
        <input
          className="form-input rule-chapter-input"
          type="text"
          value={draft.establishedIn || ''}
          onChange={(e) => setDraft((d) => ({ ...d, establishedIn: e.target.value }))}
          placeholder="Established in chapter…"
        />
        <div className="rule-item-actions">
          <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rule-item" onClick={() => { setDraft({ ...rule }); setEditing(true); }}>
      <span className={`rule-category rule-cat-${rule.category || 'other'}`}>
        {rule.category || 'other'}
      </span>
      <p className="rule-text">{rule.rule}</p>
      {rule.establishedIn && (
        <p className="rule-chapter">Est. in: {rule.establishedIn}</p>
      )}
    </div>
  );
}

export default function WorldRules({ workId, rules, onRulesChange }) {
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState({ category: 'other', rule: '', establishedIn: '' });
  const [localRules, setLocalRules] = useState(rules || []);

  async function handleAdd() {
    if (!newRule.rule.trim()) return;
    try {
      const created = await api.post(`/works/${workId}/codex/rules`, newRule);
      setLocalRules((r) => [...r, created]);
      setNewRule({ category: 'other', rule: '', establishedIn: '' });
      setAdding(false);
      onRulesChange && onRulesChange();
    } catch (err) {
      console.error('Add rule failed:', err);
    }
  }

  function handleUpdate(updated) {
    setLocalRules((r) => r.map((rule) => rule.id === updated.id ? updated : rule));
  }

  return (
    <div className="world-rules">
      <div className="world-rules-header">
        <h3 className="codex-entry-title">World Rules</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((v) => !v)}>
          + Add Rule
        </button>
      </div>

      {adding && (
        <div className="rule-item editing">
          <select
            className="form-select rule-category-select"
            value={newRule.category}
            onChange={(e) => setNewRule((r) => ({ ...r, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <textarea
            className="form-textarea rule-text-area"
            value={newRule.rule}
            onChange={(e) => setNewRule((r) => ({ ...r, rule: e.target.value }))}
            rows={3}
            placeholder="Rule text…"
            autoFocus
          />
          <input
            className="form-input rule-chapter-input"
            type="text"
            value={newRule.establishedIn}
            onChange={(e) => setNewRule((r) => ({ ...r, establishedIn: e.target.value }))}
            placeholder="Established in chapter…"
          />
          <div className="rule-item-actions">
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {localRules.length === 0 && !adding && (
        <p className="world-rules-empty">No world rules defined yet.</p>
      )}

      {localRules.map((rule) => (
        <RuleItem
          key={rule.id}
          workId={workId}
          rule={rule}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
