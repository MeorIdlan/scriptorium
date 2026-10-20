import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useModal } from '../../hooks/useModal.js';
import { countWords, formatNumber } from '../../utils/wordCount.js';
import { CURRENT, versionLabel, groupByDay, orderPair, flushOpenChapter } from '../../utils/versionHistory.js';
import VersionDiff from './VersionDiff.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';

const timeOfDay = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function ChapterHistoryModal({ workId, chapterId, onDismiss }) {
  const { state: editorState, replaceContent } = useEditor();
  const { refreshChapters } = useActiveWork();
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
  // Each editor or confirmation hands focus back to the control that opened it
  const saveSnapshotBtn = useRef(null);
  const keepBtn = useRef(null);
  const renameBtn = useRef(null);
  const restoreBtn = useRef(null);
  const deleteBtn = useRef(null);
  const listRef = useRef(null);
  const returnFocus = useReturnFocus();
  const namingTrigger = { save: saveSnapshotBtn, keep: keepBtn, rename: renameBtn };
  // The selected version's list item, read when focus lands (the list reloads first)
  const selectedItem = {
    get current() {
      return listRef.current?.querySelector('.history-item.active') ?? null;
    },
  };

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
      returnFocus(namingTrigger[naming.mode]);
      setNaming(null);
    });

  function closeNaming() {
    returnFocus(namingTrigger[naming.mode]);
    setNaming(null);
  }

  function stopConfirming(trigger) {
    returnFocus(trigger);
    setConfirming(null);
  }

  const restore = () =>
    run(async () => {
      await flushOpenChapter(api, workId, editorState, chapterId);
      const chapter = await api.post(`${base}/${selectedId}/restore`);
      replaceContent(chapter.content || '', chapter.contentHtml || '');
      // A restore can change the chapter's thread tags, which the Scenes tab reads from the chapter list
      await refreshChapters(workId);
      onDismiss();
    });

  const remove = () =>
    run(async () => {
      await api.delete(`${base}/${selectedId}`);
      await load();
      // The reload has moved the selection; focus lands on it as the confirmation closes
      returnFocus(selectedItem);
      setConfirming(null);
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
      <div key="naming" className="history-actions">
        <input
          className="history-name-input"
          value={naming.value}
          maxLength={80}
          autoFocus
          placeholder="Name this version"
          onChange={(e) => setNaming({ ...naming, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitName();
            if (e.key === 'Escape') { closeNaming(); e.stopPropagation(); }
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={guardBusy(busy, submitName)} disabled={!naming.value.trim()} {...busyProps(busy)}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={closeNaming}>Cancel</button>
      </div>
    );
  } else if (confirming === 'restore') {
    actions = (
      <div key="confirm" className="history-actions history-confirm">
        <span>Restore this version? Your current text will be saved as a snapshot first.</span>
        <button className="btn btn-primary btn-sm" onClick={guardBusy(busy, restore)} {...busyProps(busy)}>{busy ? 'Restoring…' : 'Restore'}</button>
        <button autoFocus className="btn btn-ghost btn-sm" onClick={() => stopConfirming(restoreBtn)}>Cancel</button>
      </div>
    );
  } else if (confirming === 'delete') {
    actions = (
      <div key="confirm" className="history-actions history-confirm">
        <span>Delete “{selected.name}”? This can't be undone.</span>
        <button className="btn btn-danger btn-sm" onClick={guardBusy(busy, remove)} {...busyProps(busy)}>Delete</button>
        <button autoFocus className="btn btn-ghost btn-sm" onClick={() => stopConfirming(deleteBtn)}>Cancel</button>
      </div>
    );
  } else if (selectedId !== CURRENT) {
    actions = (
      <div key="actions" className="history-actions">
        <button ref={restoreBtn} className="btn btn-primary btn-sm" onClick={guardBusy(busy, () => setConfirming('restore'))} {...busyProps(busy)}>Restore this version</button>
        {selected.kind === 'auto' && (
          <button ref={keepBtn} className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'keep', value: '' })}>Keep this version…</button>
        )}
        {selected.kind === 'named' && (
          <>
            <button ref={renameBtn} className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'rename', value: selected.name })}>Rename…</button>
            <button ref={deleteBtn} className="btn btn-ghost btn-sm" onClick={() => setConfirming('delete')}>Delete…</button>
          </>
        )}
      </div>
    );
  }

  const titleId = useId();
  const { dialogProps, backdropProps } = useModal({ onClose: onDismiss });

  return createPortal(
    <div className="modal-backdrop draft-polish-backdrop" {...backdropProps}>
      <div className="modal history-modal" aria-labelledby={titleId} {...dialogProps}>
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 id={titleId} className="modal-title">Chapter History</h2>
            <p className="draft-polish-subtitle">
              Saved automatically while you write — every version from the last day, then one a day for a month, then one a week. Named versions are kept forever.
            </p>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body history-body">
          {!versions && !error && <p className="panel-loading">Loading history…</p>}
          {versions && (
            <>
              <ul ref={listRef} className="history-list">
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
          <button ref={saveSnapshotBtn} className="btn btn-ghost" onClick={guardBusy(busy, () => setNaming({ mode: 'save', value: '' }))} disabled={!versions} {...busyProps(busy)}>
            Save snapshot…
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
