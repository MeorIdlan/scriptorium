import { useState } from 'react';
import { chapterLabel, timeAgo, usedAsLabel } from '../../utils/catchGroups.js';
import { defaultName } from '../../utils/catchActions.js';

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

  const chapter = chapters.find((ch) => ch.id === item.taggedChapterId);
  const isOpen = item.status === 'open';

  async function act(kind, payload) {
    setBusy(true);
    setError('');
    const result = await onAction(kind, payload);
    setBusy(false);
    setError(resultMessage(result));
    if (result.ok || result.stage === 'mark') setMode('view');
  }

  function startEdit() {
    setDraft(item.content);
    setDraftTag(item.taggedChapterId || '');
    setError('');
    setMode('edit');
  }

  function startUse() {
    setTarget('character');
    setName(defaultName(item.content));
    setMapChapterId(item.taggedChapterId || defaultMapChapterId || chapters[0]?.id || '');
    setError('');
    setMode('use');
  }

  function saveEdit() {
    if (!draft.trim()) return;
    act('edit', { content: draft, taggedChapterId: draftTag || null });
  }

  function saveUse() {
    if (target === 'map') {
      const ch = chapters.find((c) => c.id === mapChapterId);
      if (!ch) return;
      act('map', { chapterId: ch.id, chapterLabel: chapterLabel(ch), text: item.content });
    } else {
      if (!name.trim()) return;
      act('codex', { type: target, name, text: item.content });
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
            if (e.key === 'Escape') setMode('view');
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
        {error && <p className="catch-row-error">{error}</p>}
        <div className="catch-row-actions visible">
          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy || !draft.trim()}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode('view')} disabled={busy}>Cancel</button>
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
              onClick={saveUse}
              disabled={busy || (target === 'map' ? !mapChapterId : !name.trim())}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMode('view')} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="catch-row-error">{error}</p>}

      {mode === 'view' && (
        <div className="catch-row-actions">
          {isOpen ? (
            <>
              {canInsert && (
                <button className="btn btn-ghost btn-sm" onClick={() => act('insert')} disabled={busy} title="Insert as a new paragraph after the cursor">
                  Insert
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={startUse} disabled={busy}>Use as…</button>
              <button className="btn btn-ghost btn-sm" onClick={startEdit} disabled={busy}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => act('used')} disabled={busy}>Used</button>
              <button className="btn btn-ghost btn-sm danger" onClick={() => act('discard')} disabled={busy}>Discard</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => act('reopen')} disabled={busy}>Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}
