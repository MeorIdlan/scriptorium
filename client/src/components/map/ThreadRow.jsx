import { useRef, useState } from 'react';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { THREAD_PALETTE, threadNameError, threadDescriptionError, deleteMessage } from '../../utils/threads.js';

// One plot thread. onSave(fields) resolves true when the server accepted it;
// a refused edit stays open with what the writer typed.
export default function ThreadRow({ thread, tagCount, error, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(null); // null = not editing
  const [desc, setDesc] = useState(null);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState(thread.color);
  const [confirming, setConfirming] = useState(false);
  // Fields with a save in flight: only a repeat save of the same field is dropped
  const saving = useRef(new Set());
  // Whether each editor is open, readable by a blur that fires while it unmounts
  const nameOpen = useRef(false);
  const descOpen = useRef(false);
  // Each opener's button; a keyboard close hands focus back to the one that opened the editor
  const nameBtn = useRef(null);
  const descBtn = useRef(null);
  const deleteBtn = useRef(null);
  const returnFocus = useReturnFocus();

  const openName = () => {
    nameOpen.current = true;
    setName(thread.name);
  };
  const closeName = () => {
    nameOpen.current = false;
    setName(null);
  };
  const openDesc = () => {
    descOpen.current = true;
    setDesc(thread.description);
  };
  const closeDesc = () => {
    descOpen.current = false;
    setDesc(null);
  };

  const commit = async (key, fields, close) => {
    if (saving.current.has(key)) return;
    saving.current.add(key);
    try {
      if (await onSave(fields)) close();
      else returnFocus(null);
    } finally {
      saving.current.delete(key);
    }
  };

  const nameError = name !== null ? threadNameError(name) : null;
  const saveName = () => {
    if (!nameOpen.current || name === null || nameError) return;
    const next = name.trim();
    if (next === thread.name) return closeName();
    commit('name', { name: next }, closeName);
  };
  const onNameKey = (e) => {
    if (e.key === 'Enter') {
      // A name that will not save keeps the editor open, so there is nothing to return to yet
      returnFocus(name !== null && !threadNameError(name) ? nameBtn : null);
      saveName();
    }
    if (e.key === 'Escape') {
      returnFocus(nameBtn);
      closeName();
      onCancel?.();
    }
  };

  const descError = desc !== null ? threadDescriptionError(desc) : null;
  const saveDesc = () => {
    if (!descOpen.current || desc === null || descError) return;
    const next = desc.trim();
    if (next === thread.description) return closeDesc();
    commit('description', { description: next }, closeDesc);
  };

  const pickColor = (color) => commit('color', { color }, () => setPicking(false));
  const toggleStatus = () => commit('status', { status: thread.status === 'open' ? 'resolved' : 'open' }, () => {});

  return (
    <li className={`thread-row thread-row--${thread.status}`}>
      <div className="thread-row-main">
        <button
          className="thread-swatch"
          style={{ background: thread.color }}
          aria-label="Change colour"
          title="Change colour"
          onClick={() => {
            setCustom(thread.color);
            setPicking(!picking);
          }}
        />
        {name === null ? (
          <button ref={nameBtn} className="thread-name" onClick={openName} title="Rename">
            {thread.name}
          </button>
        ) : (
          <input
            type="text"
            className="form-input thread-name-input"
            aria-label="Thread name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={saveName}
            autoFocus
          />
        )}
        <button
          className={`thread-status thread-status--${thread.status}`}
          aria-pressed={thread.status === 'resolved'}
          title={thread.status === 'open' ? 'Mark resolved' : 'Reopen'}
          onClick={toggleStatus}
        >
          {thread.status === 'open' ? 'Open' : 'Resolved'}
        </button>
        {!confirming && (
          <button ref={deleteBtn} className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {picking && (
        <div className="thread-palette">
          {THREAD_PALETTE.map((color) => (
            <button
              key={color}
              className={`thread-palette-color${color === thread.color ? ' current' : ''}`}
              style={{ background: color }}
              aria-label={`Colour ${color}`}
              onClick={() => pickColor(color)}
            />
          ))}
          <input type="color" aria-label="Custom colour" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => pickColor(custom)}>
            Use colour
          </button>
        </div>
      )}
      {desc === null ? (
        <button ref={descBtn} className="thread-desc" onClick={openDesc}>
          {thread.description ? thread.description.split('\n')[0] : 'Add a description'}
        </button>
      ) : (
        <textarea
          className="form-input thread-desc-input"
          aria-label="Thread description"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            returnFocus(descBtn);
            closeDesc();
            onCancel?.();
          }}
          onBlur={saveDesc}
          autoFocus
        />
      )}
      {nameError && <p className="field-error">{nameError}</p>}
      {descError && <p className="field-error">{descError}</p>}
      {error && <p className="field-error">{error}</p>}
      {confirming && (
        <div className="thread-confirm">
          <p>{deleteMessage(thread.name, tagCount)}</p>
          <button
            className="btn btn-ghost btn-sm"
            autoFocus
            onClick={() => {
              returnFocus(deleteBtn);
              setConfirming(false);
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Delete thread
          </button>
        </div>
      )}
    </li>
  );
}
