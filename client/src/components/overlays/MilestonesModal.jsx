import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useModal } from '../../hooks/useModal.js';
import { formatNumber } from '../../utils/wordCount.js';
import { defaultMilestoneName, flushOpenChapter } from '../../utils/versionHistory.js';
import VersionDiff from './VersionDiff.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';

const STATE_LABELS = { changed: 'Changed', unchanged: 'Unchanged', deleted: 'Deleted since', new: 'New since' };
const dateOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MilestonesModal({ workId, onDismiss }) {
  const { state: editorState, replaceContent } = useEditor();
  const { refreshChapters } = useActiveWork();
  const base = `/works/${workId}/milestones`;
  const [milestones, setMilestones] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [naming, setNaming] = useState(null); // { mode: 'new' | 'rename', value }
  const [confirming, setConfirming] = useState(null); // { type: 'restore', row } | { type: 'delete' }
  const [compare, setCompare] = useState(null); // { row, before, after }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Each editor, comparison or confirmation hands focus back to the control that opened it
  const newBtn = useRef(null);
  const renameBtn = useRef(null);
  const deleteBtn = useRef(null);
  const listRef = useRef(null);
  const rowBtns = useRef({});
  const rowRef = (key) => (el) => {
    rowBtns.current[key] = el;
  };
  const rowTarget = (key) => ({
    get current() {
      return rowBtns.current[key] ?? null;
    },
  });
  const returnFocus = useReturnFocus();
  const namingTrigger = { new: newBtn, rename: renameBtn };
  // The selected milestone's list item, read when focus lands (the list reloads first);
  // with no milestone left, focus goes to New milestone
  const selectedItem = {
    get current() {
      return listRef.current?.querySelector('.history-item.active') ?? newBtn.current;
    },
  };

  async function loadList(selectId) {
    const list = await api.get(base);
    setMilestones(list);
    setSelectedId(selectId && list.some((m) => m.id === selectId) ? selectId : list[0]?.id ?? null);
  }

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, [workId]);

  useEffect(() => {
    setDetail(null);
    setCompare(null);
    setConfirming(null);
    if (!selectedId) return;
    let live = true;
    api
      .get(`${base}/${selectedId}`)
      .then((d) => live && setDetail(d))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [selectedId]);

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
      if (naming.mode === 'new') {
        await flushOpenChapter(api, workId, editorState, editorState.chapterId);
        const created = await api.post(base, { name });
        await loadList(created.id);
      } else {
        await api.patch(`${base}/${selectedId}`, { name });
        await loadList(selectedId);
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

  const openCompare = (row) =>
    run(async () => {
      const [snapshot, now] = await Promise.all([
        api.get(`/works/${workId}/chapters/${row.chapterId}/snapshots/${row.snapshotId}`),
        row.chapterId === editorState.chapterId
          ? Promise.resolve({ content: editorState.content })
          : api.get(`/works/${workId}/chapters/${row.chapterId}`),
      ]);
      setCompare({ row, before: snapshot.content || '', after: now.content || '' });
    });

  const restore = (row) =>
    run(async () => {
      await flushOpenChapter(api, workId, editorState, row.chapterId);
      const { chapter } = await api.post(`${base}/${selectedId}/chapters/${row.chapterId}/restore`);
      if (chapter.id === editorState.chapterId) replaceContent(chapter.content || '', chapter.contentHtml || '');
      await refreshChapters(workId);
      // The restored row leaves the confirmation's button; focus goes to the milestone list
      returnFocus(selectedItem);
      setConfirming(null);
      setCompare(null);
      setDetail(await api.get(`${base}/${selectedId}`));
    });

  const removeMilestone = () =>
    run(async () => {
      await api.delete(`${base}/${selectedId}`);
      await loadList();
      returnFocus(selectedItem);
      setConfirming(null);
    });

  const selected = milestones?.find((m) => m.id === selectedId);

  let confirmBar = null;
  if (confirming?.type === 'restore') {
    const { row } = confirming;
    confirmBar = (
      <div className="history-actions history-confirm">
        <span>
          {row.state === 'deleted'
            ? `Bring back “${row.title}”? It will be added at the end of the chapter list.`
            : `Restore “${row.title}” to this milestone? Your current text will be saved as a snapshot first.`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={guardBusy(busy, () => restore(row))} {...busyProps(busy)}>
          {row.state === 'deleted' ? 'Bring back' : 'Restore'}
        </button>
        <button autoFocus className="btn btn-ghost btn-sm" onClick={() => stopConfirming(rowTarget(`restore:${row.chapterId}`))}>Cancel</button>
      </div>
    );
  } else if (confirming?.type === 'delete') {
    confirmBar = (
      <div className="history-actions history-confirm">
        <span>Delete the milestone “{selected?.name}”? Your chapters aren't affected.</span>
        <button className="btn btn-danger btn-sm" onClick={guardBusy(busy, removeMilestone)} {...busyProps(busy)}>Delete</button>
        <button autoFocus className="btn btn-ghost btn-sm" onClick={() => stopConfirming(deleteBtn)}>Cancel</button>
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
            <h2 id={titleId} className="modal-title">Milestones</h2>
            <p className="draft-polish-subtitle">
              A milestone saves every chapter as it is now. Compare against it later, and restore any chapter on its own.
            </p>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body history-body">
          {!milestones && !error && <p className="panel-loading">Loading milestones…</p>}
          {milestones && (
            <>
              <ul ref={listRef} className="history-list">
                {milestones.length === 0 && <li className="history-empty">No milestones yet.</li>}
                {milestones.map((m) => (
                  <li key={m.id}>
                    <button
                      className={`history-item${selectedId === m.id ? ' active' : ''}`}
                      onClick={() => { setSelectedId(m.id); setNaming(null); }}
                    >
                      <span className="history-item-label history-item-label--milestone">◆ {m.name}</span>
                      <span className="history-item-meta">
                        {dateOf(m.createdAt)} · {m.chapterCount} chapter{m.chapterCount === 1 ? '' : 's'} · {formatNumber(m.wordCount)} words
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="history-main">
                {naming && (
                  <div className="history-actions">
                    <input
                      className="history-name-input"
                      value={naming.value}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitName();
                        if (e.key === 'Escape') { closeNaming(); e.stopPropagation(); }
                      }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={guardBusy(busy, submitName)} disabled={!naming.value.trim()} {...busyProps(busy)}>
                      {naming.mode === 'new' ? 'Create' : 'Save'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={closeNaming}>Cancel</button>
                  </div>
                )}

                {!selectedId && !naming && (
                  <p className="history-empty">Create a milestone before a big revision, or when a draft is done.</p>
                )}

                {selectedId && compare && (
                  <>
                    <div className="history-compare-bar">
                      <button className="btn btn-ghost btn-sm" onClick={() => { returnFocus(rowTarget(`compare:${compare.row.chapterId}`)); setCompare(null); }}>← All chapters</button>
                      <span className="history-compare-label">“{compare.row.title}”: milestone → now</span>
                    </div>
                    <div className="history-pane">
                      <VersionDiff key={compare.row.chapterId} before={compare.before} after={compare.after} />
                    </div>
                  </>
                )}

                {selectedId && !compare && (
                  <div className="history-pane">
                    {!detail ? (
                      <p className="panel-loading">Comparing with today…</p>
                    ) : detail.chapters.length === 0 ? (
                      <p className="history-empty">This milestone has no chapters.</p>
                    ) : (
                      <table className="milestone-table">
                        <thead>
                          <tr><th>Chapter</th><th>State</th><th>Words</th><th>Changes</th><th /></tr>
                        </thead>
                        <tbody>
                          {detail.chapters.map((row) => (
                            <tr key={row.chapterId}>
                              <td>{row.title}</td>
                              <td><span className={`milestone-state milestone-state--${row.state}`}>{STATE_LABELS[row.state]}</span></td>
                              <td>{formatNumber(row.wordsThen)} → {formatNumber(row.wordsNow)}</td>
                              <td>
                                {row.state === 'unchanged' ? '—' : (
                                  <>
                                    <span className="version-diff-added">+{formatNumber(row.added)}</span>
                                    {' / '}
                                    <span className="version-diff-removed">−{formatNumber(row.removed)}</span>
                                  </>
                                )}
                              </td>
                              <td className="milestone-row-actions">
                                {row.state === 'changed' && (
                                  <>
                                    <button ref={rowRef(`compare:${row.chapterId}`)} className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => openCompare(row))} {...busyProps(busy)}>Compare</button>
                                    <button ref={rowRef(`restore:${row.chapterId}`)} className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => setConfirming({ type: 'restore', row }))} {...busyProps(busy)}>Restore chapter</button>
                                  </>
                                )}
                                {row.state === 'deleted' && (
                                  <button ref={rowRef(`restore:${row.chapterId}`)} className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => setConfirming({ type: 'restore', row }))} {...busyProps(busy)}>Bring back</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {confirmBar}

                {selectedId && !naming && !confirming && (
                  <div className="history-actions">
                    <button ref={renameBtn} className="btn btn-ghost btn-sm" onClick={() => setNaming({ mode: 'rename', value: selected?.name || '' })}>Rename…</button>
                    <button ref={deleteBtn} className="btn btn-ghost btn-sm" onClick={() => setConfirming({ type: 'delete' })}>Delete…</button>
                  </div>
                )}
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            ref={newBtn}
            className="btn btn-primary"
            onClick={guardBusy(busy, () => setNaming({ mode: 'new', value: defaultMilestoneName() }))}
            disabled={!milestones}
            {...busyProps(busy)}
          >
            New milestone…
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
