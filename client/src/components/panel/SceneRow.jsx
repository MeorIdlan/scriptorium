import { useState } from 'react';
import { SCENE_STATUSES, STATUS_LABELS, SCENE_LIMITS, sceneFieldError, sceneLabel } from '../../utils/scenes.js';

const FIELDS = ['title', 'pov', 'location', 'summary'];

export default function SceneRow({ scene, current, characters, places, onJump, onSave, onRemove, children, dragProps, dragging, dropTarget, busy, error }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const startEdit = () => {
    setDraft({ title: scene.title, pov: scene.pov, location: scene.location, status: scene.status, summary: scene.summary });
    setEditing(true);
  };
  const errors = draft ? Object.fromEntries(FIELDS.map((f) => [f, sceneFieldError(f, draft[f])])) : {};
  const blocked = Object.values(errors).some(Boolean);
  const save = () => {
    if (blocked) return;
    onSave(draft);
    setEditing(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') setEditing(false);
  };
  const meta = [scene.pov, scene.location].filter((v) => v && v.trim()).join(' · ');

  return (
    <li
      className={`scene-row${current ? ' current' : ''}${dragging ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}`}
      {...dragProps}
    >
      {!editing && (
        <>
          {dragProps && <span className="scene-row-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>}
          <button className="scene-row-main" onClick={onJump} title="Go to this scene">
            <span className="scene-row-title">{sceneLabel(scene)}</span>
            {meta && <span className="scene-row-meta">{meta}</span>}
            <span className="scene-row-line">
              <span className={`scene-status scene-status--${scene.status}`}>{STATUS_LABELS[scene.status]}</span>
              <span className="scene-row-words">{scene.wordCount.toLocaleString('en-US')} words</span>
            </span>
            {scene.summary && <span className="scene-row-summary">{scene.summary.split('\n')[0]}</span>}
          </button>
          <div className="scene-row-actions">
            <button className="btn btn-ghost btn-sm" onClick={startEdit} disabled={busy}>Edit card</button>
            {scene.id && !confirming && (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)} disabled={busy}>Remove break</button>
            )}
            {children}
          </div>
          {confirming && (
            <div className="scene-row-confirm">
              <p>Remove this scene break? The text joins the scene before it and this card is deleted.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setConfirming(false);
                  onRemove();
                }}
              >
                Remove
              </button>
            </div>
          )}
        </>
      )}
      {editing && (
        <div className="scene-card-form" onKeyDown={onKeyDown}>
          <label>
            Title
            <input className="form-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
          </label>
          {errors.title && <p className="field-error">{errors.title}</p>}
          <label>
            POV
            <input className="form-input" list="scene-pov-options" value={draft.pov} onChange={(e) => setDraft({ ...draft, pov: e.target.value })} />
          </label>
          {errors.pov && <p className="field-error">{errors.pov}</p>}
          <label>
            Location
            <input className="form-input" list="scene-location-options" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </label>
          {errors.location && <p className="field-error">{errors.location}</p>}
          <label>
            Status
            <select className="form-select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              {SCENE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label>
            Summary
            <textarea className="form-textarea" rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </label>
          <p className={`field-count${errors.summary ? ' over' : ''}`}>
            {errors.summary || `${draft.summary.trim().length} / ${SCENE_LIMITS.summary}`}
          </p>
          <datalist id="scene-pov-options">
            {characters.map((n) => <option key={n} value={n} />)}
          </datalist>
          <datalist id="scene-location-options">
            {places.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="scene-card-buttons">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={blocked}>Save</button>
          </div>
        </div>
      )}
      {error && <p className="scene-row-error">{error}</p>}
    </li>
  );
}
