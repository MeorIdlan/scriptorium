import { useRef, useState } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { catchLengthError, chapterLabel, liveChapterId, timeAgo, usedAsLabel } from '../../utils/catchGroups.js';
import { defaultName } from '../../utils/catchActions.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

const USE_TARGETS = [
  { value: 'character', label: 'Codex character' },
  { value: 'place', label: 'Codex place' },
  { value: 'rule', label: 'Codex rule' },
  { value: 'map', label: 'Map note' },
];

function resultMessage(result) {
  if (result.ok) return '';
  if (result.stage === 'mark') return "Done, but couldn't mark the catch used. Press Used to mark it.";
  return result.error?.message || 'Something went wrong.';
}

export default function CatchRow({ item, chapters, showChapter, canInsert, defaultMapChapterId, onAction }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'use'
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [target, setTarget] = useState('character');
  const [name, setName] = useState('');
  const [mapChapterId, setMapChapterId] = useState('');
  // The Edit and Use as… buttons: an editor closing hands focus back to the one that opened it
  const editBtn = useRef(null);
  const useBtn = useRef(null);
  const returnFocus = useReturnFocus();

  const chapter = chapters.find((ch) => ch.id === item.taggedChapterId);
  const isOpen = item.status === 'open';

  // returnTo is the button to focus when the editor closes on success; a refused save
  // keeps the editor open, so the target is cleared
  async function act(kind, payload, returnTo) {
    setBusy(true);
    setError('');
    if (returnTo) returnFocus(returnTo);
    const result = await onAction(kind, payload);
    setBusy(false);
    setError(resultMessage(result));
    if (result.ok || result.stage === 'mark') setMode('view');
    else returnFocus(null);
  }

  function startEdit() {
    setDraft(item.content);
    setDraftTag(liveChapterId(chapters, item.taggedChapterId));
    setError('');
    setMode('edit');
  }

  function startUse() {
    setTarget('character');
    setName(defaultName(item.content));
    setMapChapterId(
      liveChapterId(chapters, item.taggedChapterId) || liveChapterId(chapters, defaultMapChapterId) || chapters[0]?.id || ''
    );
    setError('');
    setMode('use');
  }

  function saveEdit() {
    if (!draft.trim() || catchLengthError(draft)) return;
    act('edit', { content: draft, taggedChapterId: draftTag || null }, editBtn);
  }

  function saveUse() {
    if (target === 'map') {
      const ch = chapters.find((c) => c.id === mapChapterId);
      if (!ch) return;
      act('map', { chapterId: ch.id, chapterLabel: chapterLabel(ch), text: item.content }, useBtn);
    } else {
      if (!name.trim()) return;
      act('codex', { type: target, name, text: item.content }, useBtn);
    }
  }

  if (mode === 'edit') {
    return (
      <div className="catch-row editing">
        <textarea
          className="form-textarea catch-edit-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === 'Escape') {
              returnFocus(editBtn);
              setMode('view');
            }
          }}
          rows={3}
          autoFocus
          aria-label="Catch text"
        />
        <select className="form-select catch-edit-tag" value={draftTag} onChange={(e) => setDraftTag(e.target.value)} aria-label="Chapter">
          <option value="">No chapter</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>
          ))}
        </select>
        {(catchLengthError(draft) || error) && <p className="catch-row-error">{catchLengthError(draft) || error}</p>}
        <div className="catch-row-actions visible">
          <button className="btn btn-primary btn-sm" onClick={guardBusy(busy, saveEdit)} disabled={!draft.trim() || Boolean(catchLengthError(draft))} {...busyProps(busy)}>Save</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={guardBusy(busy, () => {
              returnFocus(editBtn);
              setMode('view');
            })}
            {...busyProps(busy)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="catch-row">
      <p
        className={`catch-row-text${expanded ? '' : ' clamped'}`}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse' : 'Show all'}
      >
        {item.content}
      </p>
      <div className="catch-row-meta">
        {showChapter && chapter && <span className="catch-row-chapter">{chapterLabel(chapter)}</span>}
        <span className="catch-row-age">{timeAgo(item.createdAt)}</span>
        {item.status === 'used' && <span className="catch-row-used">{usedAsLabel(item.usedAs) || 'Used'}</span>}
        {item.status === 'discarded' && <span className="catch-row-used">Discarded</span>}
      </div>

      {mode === 'use' && (
        <div className="catch-use">
          <select className="form-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Use as">
            {USE_TARGETS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {target === 'map' ? (
            <select className="form-select" value={mapChapterId} onChange={(e) => setMapChapterId(e.target.value)} aria-label="Map chapter">
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>
              ))}
            </select>
          ) : (
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Name"
              maxLength={120}
            />
          )}
          <div className="catch-row-actions visible">
            <button
              className="btn btn-primary btn-sm"
              onClick={guardBusy(busy, saveUse)}
              disabled={target === 'map' ? !mapChapterId : !name.trim()}
              {...busyProps(busy)}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={guardBusy(busy, () => {
                returnFocus(useBtn);
                setMode('view');
              })}
              {...busyProps(busy)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="catch-row-error">{error}</p>}

      {mode === 'view' && (
        <div className="catch-row-actions">
          {isOpen ? (
            <>
              {canInsert && (
                <button className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => act('insert'))} {...busyProps(busy)} title="Insert as a new paragraph after the cursor">
                  Insert
                </button>
              )}
              <button ref={useBtn} className="btn btn-ghost btn-sm" onClick={guardBusy(busy, startUse)} {...busyProps(busy)}>Use as…</button>
              <button ref={editBtn} className="btn btn-ghost btn-sm" onClick={guardBusy(busy, startEdit)} {...busyProps(busy)}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => act('used'))} {...busyProps(busy)}>Used</button>
              <button className="btn btn-ghost btn-sm danger" onClick={guardBusy(busy, () => act('discard'))} {...busyProps(busy)}>Discard</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={guardBusy(busy, () => act('reopen'))} {...busyProps(busy)}>Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}
