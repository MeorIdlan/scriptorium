import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { useAI } from '../hooks/useAI.js';
import CharacterSheet from '../components/codex/CharacterSheet.jsx';
import PlaceEntry from '../components/codex/PlaceEntry.jsx';
import RuleDetail from '../components/codex/RuleDetail.jsx';
import CodexAuditModal from '../components/overlays/CodexAuditModal.jsx';

const TABS = [
  { id: 'characters', label: 'Characters' },
  { id: 'places', label: 'Places' },
  { id: 'rules', label: 'World Rules' },
];

const RULE_CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

function AddEntityModal({ type, onConfirm, onClose }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
    if (e.key === 'Escape') onClose();
  }

  const label = type === 'character' ? 'Character' : 'Place';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New {label}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">{label} name</label>
            <input
              ref={inputRef}
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Enter ${label.toLowerCase()} name…`}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="modal-footer-right">
            <button
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={() => onConfirm(name.trim())}
            >
              Add {label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddRuleModal({ onConfirm, onClose }) {
  const [category, setCategory] = useState('other');
  const [ruleText, setRuleText] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New World Rule</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {RULE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Rule</label>
            <textarea
              ref={textareaRef}
              className="form-textarea"
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              placeholder="Describe the rule…"
              rows={4}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="modal-footer-right">
            <button
              className="btn btn-primary"
              disabled={!ruleText.trim()}
              onClick={() => onConfirm({ category, rule: ruleText.trim() })}
            >
              Add Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SLIDE = 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1)';

export default function CodexView() {
  const { workId } = useParams();
  const [codex, setCodex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('characters');
  const [selectedId, setSelectedId] = useState(null);
  const [addModal, setAddModal] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const { loading: aiLoading, error: aiError, call: aiCall, reset: aiReset } = useAI();
  const tabsRef = useRef(null);
  const indicatorRef = useRef(null);
  const tabMounted = useRef(false);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    if (!tabs || !indicator) return;
    const active = tabs.querySelector('.codex-tab.active');
    if (!active) return;
    indicator.style.transition = tabMounted.current ? SLIDE : 'none';
    indicator.style.left = `${active.offsetLeft}px`;
    indicator.style.width = `${active.offsetWidth}px`;
    tabMounted.current = true;
  }, [activeTab]);

  const fetchCodex = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    try {
      const data = await api.get(`/works/${workId}/codex`);
      setCodex(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => { fetchCodex(); }, [fetchCodex]);

  async function handleAudit() {
    aiReset();
    setAuditResult(null);
    const data = await aiCall('codex-audit', { workId });
    if (data) setAuditResult(data);
  }

  async function handleAddConfirm(name) {
    const type = addModal;
    setAddModal(null);
    try {
      const endpoint = type === 'character'
        ? `/works/${workId}/codex/characters`
        : `/works/${workId}/codex/places`;
      await api.post(endpoint, { name });
      fetchCodex();
    } catch (err) {
      console.error('Add failed:', err);
    }
  }

  async function handleAddRuleConfirm({ category, rule }) {
    setAddModal(null);
    try {
      const created = await api.post(`/works/${workId}/codex/rules`, { category, rule });
      setCodex((c) => ({ ...c, worldRules: [...(c?.worldRules || []), created] }));
      setSelectedId(created.id);
    } catch (err) {
      console.error('Add rule failed:', err);
    }
  }

  if (loading) {
    return <div className="loading-page"><p className="loading-text">Loading codex…</p></div>;
  }
  if (error) {
    return <div className="loading-page"><p className="error-text">{error}</p></div>;
  }

  const characters = codex?.characters || [];
  const places = codex?.places || [];
  const rules = codex?.worldRules || [];
  const allFlags = codex?.flags || [];
  const openFlags = allFlags.filter((f) => f.status === 'open');

  const listItems = activeTab === 'characters' ? characters
    : activeTab === 'places' ? places
    : rules;

  const selectedItem = listItems.find((item) => item.id === selectedId);

  function ruleListLabel(rule) {
    const text = rule.rule || '';
    return text.length > 42 ? text.slice(0, 42) + '…' : text || '(empty)';
  }

  return (
    <div className="codex-view">
      {/* Left column: entity list */}
      <div className="codex-list-col">
        <div className="codex-tabs" ref={tabsRef}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`codex-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setSelectedId(null); }}
            >
              {tab.label}
            </button>
          ))}
          <div ref={indicatorRef} className="codex-tab-indicator" />
        </div>

        <div className="codex-list-header">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setAddModal(
              activeTab === 'characters' ? 'character'
              : activeTab === 'places' ? 'place'
              : 'rule'
            )}
          >
            + Add
          </button>
        </div>

        <div className="codex-entity-list">
          <div key={activeTab} className="tab-enter">
          {listItems.map((item) => (
            <button
              key={item.id}
              className={`codex-entity-item${item.id === selectedId ? ' active' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              {activeTab === 'rules' ? (
                <>
                  <span className="codex-rule-item-text">{ruleListLabel(item)}</span>
                  <span className={`codex-rule-cat-dot cat-${item.category || 'other'}`} />
                </>
              ) : (
                <>
                  {item.name}
                  {(item.flags || []).filter((f) => f.status === 'open').length > 0 && (
                    <span className="codex-entity-flag-dot" />
                  )}
                </>
              )}
            </button>
          ))}
          {listItems.length === 0 && (
            <p className="codex-empty">
              No {activeTab === 'rules' ? 'world rules' : activeTab} yet.
            </p>
          )}
          </div>
        </div>
      </div>

      {/* Center: detail view */}
      <div className="codex-detail-col">
        <div key={activeTab} className="tab-enter">
        {!selectedItem && (
          <div className="codex-detail-empty">
            <p>Select an entry from the list to view and edit details.</p>
          </div>
        )}
        {selectedItem && activeTab === 'characters' && (
          <CharacterSheet
            workId={workId}
            character={selectedItem}
            onUpdate={(updated) => {
              setCodex((c) => ({
                ...c,
                characters: c.characters.map((ch) =>
                  ch.id === updated.id ? updated : ch
                ),
              }));
            }}
            onFlagsChange={fetchCodex}
          />
        )}
        {selectedItem && activeTab === 'places' && (
          <PlaceEntry
            workId={workId}
            place={selectedItem}
            onUpdate={(updated) => {
              setCodex((c) => ({
                ...c,
                places: c.places.map((p) =>
                  p.id === updated.id ? updated : p
                ),
              }));
            }}
            onFlagsChange={fetchCodex}
          />
        )}
        {selectedItem && activeTab === 'rules' && (
          <RuleDetail
            workId={workId}
            rule={selectedItem}
            onUpdate={(updated) => {
              setCodex((c) => ({
                ...c,
                worldRules: c.worldRules.map((r) =>
                  r.id === updated.id ? updated : r
                ),
              }));
            }}
          />
        )}
        </div>
      </div>

      {/* Right: flags + AI panel */}
      <div className="codex-flags-col">
        <p className="codex-flags-title">Open Flags</p>
        {openFlags.length === 0 && (
          <p className="codex-flags-empty">No open flags.</p>
        )}
        {openFlags.map((flag) => (
          <div key={flag.id} className="codex-flag-panel-item">
            <p className="codex-flag-panel-text">{flag.description || flag.message}</p>
            {flag.entityName && (
              <p className="codex-flag-panel-entity">{flag.entityName}</p>
            )}
          </div>
        ))}

        <div className="codex-ai-section">
          <p className="codex-ai-title">AI Assist</p>
          <button
            className="btn btn-ghost codex-ai-btn"
            onClick={handleAudit}
            disabled={aiLoading}
            title="Analyse all characters, places, and world rules for completeness and consistency"
          >
            {aiLoading ? 'Auditing…' : '◈ Codex Audit'}
          </button>
          {aiError && <p className="codex-suggest-error">{aiError}</p>}
        </div>
      </div>

      {addModal && addModal !== 'rule' && (
        <AddEntityModal
          type={addModal}
          onConfirm={handleAddConfirm}
          onClose={() => setAddModal(null)}
        />
      )}
      {addModal === 'rule' && (
        <AddRuleModal
          onConfirm={handleAddRuleConfirm}
          onClose={() => setAddModal(null)}
        />
      )}

      {auditResult && (
        <CodexAuditModal
          audit={auditResult}
          onDismiss={() => setAuditResult(null)}
        />
      )}
    </div>
  );
}
