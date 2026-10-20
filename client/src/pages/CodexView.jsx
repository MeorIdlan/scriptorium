import { useEffect, useId, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { useAI } from '../hooks/useAI.js';
import CharacterSheet from '../components/codex/CharacterSheet.jsx';
import PlaceEntry from '../components/codex/PlaceEntry.jsx';
import RuleDetail from '../components/codex/RuleDetail.jsx';
import CodexAuditModal from '../components/overlays/CodexAuditModal.jsx';
import { useAiState } from '../context/AiContext.jsx';
import { useModal } from '../hooks/useModal.js';
import { busyProps, guardBusy } from '../utils/busyButton.js';

const TABS = [
  { id: 'characters', label: 'Characters' },
  { id: 'places', label: 'Places' },
  { id: 'rules', label: 'World Rules' },
];

const RULE_CATEGORIES = ['magic', 'politics', 'geography', 'society', 'other'];

function AddEntityModal({ type, onConfirm, onClose }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && name.trim()) {
      // Claim the key: focus returns to the opener on confirm, and Chrome would
      // otherwise click it again for this same Enter
      e.preventDefault();
      onConfirm(name.trim());
    }
  }

  const titleId = useId();
  const { dialogProps, backdropProps } = useModal({ onClose, initialFocusRef: inputRef });

  const label = type === 'character' ? 'Character' : 'Place';

  return (
    <div className="modal-backdrop" {...backdropProps}>
      <div className="modal" style={{ maxWidth: 380 }} aria-labelledby={titleId} {...dialogProps}>
        <div className="modal-header">
          <span id={titleId} className="modal-title">New {label}</span>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">{label} name</label>
            <input
              ref={inputRef}
              className="form-input"
              type="text"
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

  const titleId = useId();
  const { dialogProps, backdropProps } = useModal({ onClose, initialFocusRef: textareaRef });

  return (
    <div className="modal-backdrop" {...backdropProps}>
      <div className="modal" style={{ maxWidth: 460 }} aria-labelledby={titleId} {...dialogProps}>
        <div className="modal-header">
          <span id={titleId} className="modal-title">New World Rule</span>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
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
  const { aiOn } = useAiState();
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

  // Only the first load replaces the page; a refresh keeps it up, so focus survives it
  if (loading && !codex) {
    return <div className="loading-page"><p className="loading-text">Loading codex…</p></div>;
  }
  if (error) {
    return <div className="loading-page"><p className="error-text">{error}</p></div>;
  }

  const characters = codex?.characters || [];
  const places = codex?.places || [];
  const rules = codex?.worldRules || [];
  // Flags live on each entry; rules are named by their rule text
  const openFlags = [
    ...characters.map((e) => [e, e.name]),
    ...places.map((e) => [e, e.name]),
    ...rules.map((e) => [e, e.rule]),
  ].flatMap(([entry, entityName]) =>
    (entry.flags || [])
      .filter((f) => f.status === 'unresolved')
      .map((f) => ({ ...f, entityName }))
  );

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
                  {(item.flags || []).filter((f) => f.status === 'unresolved').length > 0 && (
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
            <p className="codex-flag-panel-text">{flag.note}</p>
            {flag.entityName && (
              <p className="codex-flag-panel-entity">{flag.entityName}</p>
            )}
          </div>
        ))}

        {aiOn && (
          <div className="codex-ai-section">
            <p className="codex-ai-title">AI Assist</p>
            <button
              className="btn btn-ghost codex-ai-btn"
              onClick={guardBusy(aiLoading, handleAudit)}
              {...busyProps(aiLoading)}
              title="Analyse all characters, places, and world rules for completeness and consistency"
            >
              {aiLoading ? 'Auditing…' : '◈ Codex Audit'}
            </button>
            {aiError && <p className="codex-suggest-error">{aiError}</p>}
          </div>
        )}
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

      {aiOn && auditResult && (
        <CodexAuditModal
          audit={auditResult}
          onDismiss={() => setAuditResult(null)}
        />
      )}
    </div>
  );
}
