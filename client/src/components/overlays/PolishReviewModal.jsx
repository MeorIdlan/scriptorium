import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { buildChanges, diffWords } from '../../utils/polishDiff.js';
import { applyPolish } from '../../utils/applyPolish.js';
import ContextUsed from '../panel/ContextUsed.jsx';
import { useModal } from '../../hooks/useModal.js';

const isFatal = (err) => err.code === 'NO_API_KEY' || [401, 403, 404].includes(err.status);

function ChangeView({ change, onSet }) {
  const { status, fromText, toText } = change;
  let body;
  if (status === 'accepted') body = <span className="polish-add">{toText}</span>;
  else if (status === 'rejected') body = <span className="polish-rejected">{fromText}</span>;
  else {
    body = diffWords(fromText, toText).map((op, i) =>
      op.type === 'same' ? (
        <span key={i}>{op.text}</span>
      ) : (
        <span key={i} className={op.type === 'del' ? 'polish-del' : 'polish-add'}>{op.text}</span>
      )
    );
  }
  return (
    <span className={`polish-change polish-change--${status}`}>
      {body}
      <span className="polish-change-actions">
        <button
          className={`polish-change-btn${status === 'accepted' ? ' active' : ''}`}
          onClick={() => onSet(change.id, 'accepted')}
          title="Accept this change"
        >
          ✓
        </button>
        <button
          className={`polish-change-btn${status === 'rejected' ? ' active' : ''}`}
          onClick={() => onSet(change.id, 'rejected')}
          title="Keep the original"
        >
          ✕
        </button>
      </span>
    </span>
  );
}

export default function PolishReviewModal({ workId, chapterId, session, summariesPending, onClose }) {
  const { setContent } = useEditor();
  const { refreshChapters } = useActiveWork();
  const [parts, setParts] = useState(() => session.batches.map(() => ({ status: 'pending', error: null })));
  const [segments, setSegments] = useState({});
  const [changes, setChanges] = useState({});
  const [missing, setMissing] = useState([]);
  const [context, setContext] = useState(null);
  const [fatal, setFatal] = useState(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const setPart = (i, part) => setParts((ps) => ps.map((p, k) => (k === i ? part : p)));

  async function runPart(i) {
    setPart(i, { status: 'running', error: null });
    const targets = session.batches[i];
    try {
      const data = await api.post('/ai/polish-draft', {
        workId,
        chapterId,
        chapterText: session.chapterText,
        targets: targets.map((t) => ({ id: t.id, text: t.text })),
      });
      if (!alive.current) return 'stopped';
      const built = buildChanges(targets, data.rewrites || []);
      setSegments((s) => ({ ...s, ...built.segmentsByTarget }));
      setChanges((c) => ({ ...c, ...Object.fromEntries(built.changes.map((ch) => [ch.id, ch])) }));
      setMissing((m) => [...m, ...(data.missing || [])]);
      if (data.context) setContext((c) => c || data.context);
      setPart(i, { status: 'done', error: null });
      return 'done';
    } catch (err) {
      if (!alive.current) return 'stopped';
      setPart(i, { status: 'failed', error: err.message });
      if (isFatal(err)) {
        setFatal(err.code === 'NO_API_KEY' ? 'No API key configured. Please go to Settings to add your API key.' : err.message);
        return 'fatal';
      }
      return 'failed';
    }
  }

  useEffect(() => {
    (async () => {
      for (let i = 0; i < session.batches.length; i++) {
        const outcome = await runPart(i);
        if (outcome === 'stopped' || outcome === 'fatal') return;
      }
      // The first part may have made chapter summaries
      if (alive.current) refreshChapters(workId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = Object.values(changes);
  const accepted = list.filter((c) => c.status === 'accepted').length;
  const rejected = list.filter((c) => c.status === 'rejected').length;
  const runningIndex = parts.findIndex((p) => p.status === 'running');
  const busy = parts.some((p) => p.status === 'running' || (p.status === 'pending' && !fatal));
  const allDone = parts.every((p) => p.status === 'done');

  const setStatus = (id, status) => setChanges((c) => ({ ...c, [id]: { ...c[id], status } }));
  const setAll = (status) => setChanges((c) => Object.fromEntries(Object.entries(c).map(([id, ch]) => [id, { ...ch, status }])));

  // Consecutive targets in the same block render as one paragraph
  const paragraphs = useMemo(() => {
    const groups = [];
    for (const target of session.batches.flat()) {
      const last = groups[groups.length - 1];
      if (last && last.blockIndex === target.blockIndex) last.targets.push(target);
      else groups.push({ blockIndex: target.blockIndex, targets: [target] });
    }
    return groups;
  }, [session]);

  function handleApply() {
    const editorEl = document.querySelector('.editor');
    if (!editorEl) return;
    const result = applyPolish(editorEl, list, session.blockTexts);
    setContent(editorEl.innerText || '', editorEl.innerHTML);
    onClose(result);
  }

  let status;
  if (fatal) status = fatal;
  else if (runningIndex >= 0) {
    status = `Polishing part ${runningIndex + 1} of ${parts.length}…${runningIndex === 0 && summariesPending ? ' (updating chapter summaries)' : ''}`;
  } else if (allDone && list.length === 0) status = 'No changes suggested.';
  else status = `${list.length} change${list.length === 1 ? '' : 's'} · ${accepted} accepted · ${rejected} rejected`;

  // Esc closes like the ✕ button; no backdrop click, so a stray click keeps the review
  const { dialogProps } = useModal({ onClose: () => onClose(null) });

  // Portal: the Quill panel's tab animation leaves a transform that would
  // trap a position:fixed overlay inside the panel
  return createPortal(
    <div className="modal-backdrop draft-polish-backdrop">
      <div className="modal polish-review-modal" {...dialogProps}>
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Polish {session.mode === 'selection' ? 'selection' : 'chapter'}</h2>
            <p className="draft-polish-subtitle">Accept the changes you want. Nothing in your chapter changes until you apply.</p>
          </div>
          <button className="modal-close" onClick={() => onClose(null)}>✕</button>
        </div>

        <div className="polish-review-toolbar">
          <span className={`polish-review-status${fatal ? ' polish-review-status--error' : ''}`}>{status}</span>
          <span className="polish-review-bulk">
            <button className="btn btn-ghost btn-sm" onClick={() => setAll('accepted')} disabled={list.length === 0}>Accept all</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAll('rejected')} disabled={list.length === 0}>Reject all</button>
          </span>
        </div>

        <div className="modal-body polish-review-body">
          {paragraphs.map((para, pi) => (
            <p key={pi} className="polish-para">
              {para.targets.map((target, ti) => {
                const segs = segments[target.id];
                return (
                  <span key={target.id}>
                    {ti > 0 && ' '}
                    {segs
                      ? segs.map((seg, si) =>
                          seg.type === 'equal' ? (
                            <span key={si}>{seg.text}</span>
                          ) : (
                            <ChangeView key={seg.changeId} change={changes[seg.changeId]} onSet={setStatus} />
                          )
                        )
                      : <span className="polish-waiting">{target.text}</span>}
                  </span>
                );
              })}
            </p>
          ))}

          {parts.map((p, i) =>
            p.status === 'failed' && !fatal ? (
              <p key={i} className="polish-part-failed">
                Part {i + 1} of {parts.length} failed: {p.error}{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => runPart(i)}>Retry part</button>
              </p>
            ) : null
          )}
          {missing.length > 0 && (
            <p className="polish-note">
              {missing.length} passage{missing.length === 1 ? '' : 's'} came back unchanged.
            </p>
          )}
          <ContextUsed context={context} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => onClose(null)}>Discard</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={busy || accepted === 0}>
            Apply {accepted || ''} accepted change{accepted === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
