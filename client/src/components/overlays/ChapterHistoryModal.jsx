import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { countWords, formatNumber } from '../../utils/wordCount.js';
import { CURRENT, versionLabel, groupByDay, orderPair, flushOpenChapter } from '../../utils/versionHistory.js';
import VersionDiff from './VersionDiff.jsx';

const timeOfDay = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function ChapterHistoryModal({ workId, chapterId, onDismiss }) {
  const { state: editorState, replaceContent } = useEditor();
  const base = `/works/${workId}/chapters/${chapterId}/snapshots`;
  const [versions, setVersions] = useState(null);
  const [selectedId, setSelectedId] = useState(CURRENT);
  const [compareId, setCompareId] = useState(CURRENT);
  const [texts, setTexts] = useState({});
  const [view, setView] = useState('changes');
  const [naming, setNaming] = useState(null); // { mode: 'save' | 'keep' | 'rename', value }
  const [confirming, setConfirming] = useState(null); // 'restore' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const current = { id: CURRENT, kind: 'current', createdAt: null, wordCount: countWords(editorState.content || '') };
  const byId = (id) => (id === CURRENT ? current : versions?.find((v) => v.id === id));

  async function load(selectId) {
    const list = await api.get(base);
    setVersions(list);
    const sel = selectId && (selectId === CURRENT || list.some((v) => v.id === selectId)) ? selectId : list[0]?.id ?? CURRENT;
    setSelectedId(sel);
    setCompareId(sel === CURRENT ? list[0]?.id ?? CURRENT : CURRENT);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [workId, chapterId]);

  // Fetch the text of each version on screen, once
  useEffect(() => {
    for (const id of [selectedId, compareId]) {
      if (id === CURRENT || texts[id] !== undefined) continue;
      api
        .get(`${base}/${id}`)
        .then((s) => setTexts((prev) => ({ ...prev, [id]: s.content || '' })))
        .catch((err) => setError(err.message));
    }
  }, [selectedId, compareId]);

  const textOf = (id) => (id === CURRENT ? editorState.content || '' : texts[id]);

  function select(id) {
    setSelectedId(id);
    setNaming(null);
    setConfirming(null);
    if (id === compareId) setCompareId(id === CURRENT ? versions?.[0]?.id ?? CURRENT : CURRENT);
  }

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submitName = () =>
    run(async () => {
      const name = naming.value.trim();
      if (!name) return;
      if (naming.mode === 'save') {
        await flushOpenChapter(api, workId, editorState, chapterId);
        const saved = await api.post(base, { name });
        await load(saved.id);
      } else {
        await api.patch(`${base}/${selectedId}`, { name });
        await load(selectedId);
      }
      setNaming(null);
    });

  const restore = () =>
    run(async () => {
      await flushOpenChapter(api, workId, editorState, chapterId);
      const chapter = await api.post(`${base}/${selectedId}/restore`);
      replaceContent(chapter.content || '', chapter.contentHtml || '');
      onDismiss();
    });

  const remove = () =>
    run(async () => {
      await api.delete(`${base}/${selectedId}`);
      setConfirming(null);
      await load();
    });

  const selected = byId(selectedId) || current;
  const compare = byId(compareId) || current;
  const [older, newer] = orderPair(selected, compare);
  const olderText = textOf(older.id);
  const newerText = textOf(newer.id);
  const hasVersions = versions && versions.length > 0;

  let actions = null;
  if (naming) {
    actions = (
      <div className="history-actions">
        <input
          className="history-name-input"
          value={naming.value}
          maxLength={80}
          autoFocus
          placeholder="Name this version"
          onChange={(e) => setNaming({ ...naming, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName();
            if (e.key === 'Escape') setNaming(null);
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={submitName} disabled={busy || !naming.value.trim()}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>Cancel</button>
      </div>
    );
  } else if (confirming === 'restore') {
    actions = (
      <div className="history-actions history-confirm">
        <span>Restore this version? Your current text will be saved as a snapshot first.</span>
        <button className="btn btn-primary btn-sm" onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Restore'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  } else if (confirming === 'delete') {
    actions = (
      <div className="history-actions history-confirm">
        <span>Delete “{selected.name}”? This can't be undone.</span>
        <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
      </div>
    );
  } else if (selectedId !== CURRENT) {
    actions = (
      <div className="history-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setConfirming('restore')} disabled={busy}>Restore this version</button>
        {selected.kind === 'auto' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'keep', value: '' })}>Keep this version…</button>
        )}
        {selected.kind === 'named' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'rename', value: selected.name })}>Rename…</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming('delete')}>Delete…</button>
          </>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="modal-backdrop draft-polish-backdrop" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="modal history-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Chapter History</h2>
            <p className="draft-polish-subtitle">
              Saved automatically while you write — every version from the last day, then one a day for a month, then one a week. Named versions are kept forever.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body history-body">
          {!versions && !error && <p className="panel-loading">Loading history…</p>}
          {versions && (
            <>
              <ul className="history-list">
                <li>
                  <button className={`history-item${selectedId === CURRENT ? ' active' : ''}`} onClick={() => select(CURRENT)}>
                    <span className="history-item-label">Current text</span>
                    <span className="history-item-meta">{formatNumber(current.wordCount)} words</span>
                  </button>
                </li>
                {groupByDay(versions).map((group) => (
                  <li key={group.label}>
                    <div className="history-day">{group.label}</div>
                    <ul className="history-sublist">
                      {group.items.map((v) => (
                        <li key={v.id}>
                          <button className={`history-item${selectedId === v.id ? ' active' : ''}`} onClick={() => select(v.id)}>
                            <span className={`history-item-label history-item-label--${v.kind}`}>{versionLabel(v)}</span>
                            <span className="history-item-meta">{timeOfDay(v.createdAt)} · {formatNumber(v.wordCount)} words</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <div className="history-main">
                {!hasVersions ? (
                  <p className="history-empty">No snapshots yet. They appear as you keep writing, or save one now.</p>
                ) : (
                  <>
                    <div className="history-compare-bar">
                      <label className="history-compare-label">
                        Compare with
                        <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
                          {selectedId !== CURRENT && <option value={CURRENT}>Current text</option>}
                          {versions.filter((v) => v.id !== selectedId).map((v) => (
                            <option key={v.id} value={v.id}>{versionLabel(v)} — {fullTime(v.createdAt)}</option>
                          ))}
                        </select>
                      </label>
                      <div className="history-view-toggle">
                        <button className={`btn btn-ghost btn-sm${view === 'changes' ? ' active' : ''}`} onClick={() => setView('changes')}>Changes</button>
                        <button className={`btn btn-ghost btn-sm${view === 'full' ? ' active' : ''}`} onClick={() => setView('full')}>Full text</button>
                      </div>
                    </div>
                    <div className="history-pane">
                      {view === 'full' ? (
                        textOf(selectedId) === undefined ? <p className="panel-loading">Loading…</p> : <pre className="history-fulltext">{textOf(selectedId) || '(empty)'}</pre>
                      ) : olderText === undefined || newerText === undefined ? (
                        <p className="panel-loading">Loading…</p>
                      ) : (
                        <VersionDiff key={`${older.id}:${newer.id}`} before={olderText} after={newerText} />
                      )}
                    </div>
                  </>
                )}
                {actions}
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setNaming({ mode: 'save', value: '' })} disabled={busy || !versions}>
            Save snapshot…
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
