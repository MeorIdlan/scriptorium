import { useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { rowLeaveFocus } from '../../utils/rowLeave.js';

// fallback is the entry's first field: focus goes there when the last flag leaves
export default function FlagList({ workId, flags, entityType, entityId, onFlagsChange, fallback }) {
  const [busyId, setBusyId] = useState(null);
  const list = useRef(null);
  const returnFocus = useReturnFocus();

  if (!flags || flags.length === 0) {
    return <p className="flags-empty">No flags for this entry.</p>;
  }

  async function handleAction(flag, index, action) {
    // A resolved flag leaves the list: focus goes to the next flag's first action, else the
    // previous one, else the fallback
    returnFocus(rowLeaveFocus([...list.current.querySelectorAll('.flag-item')], index, fallback?.current ?? null));
    setBusyId(flag.id);
    try {
      await api.put(`/works/${workId}/codex/flags/${flag.id}`, { status: action });
      onFlagsChange();
    } catch (err) {
      console.error('Flag action failed:', err);
      returnFocus(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flag-list" ref={list}>
      <p className="flag-list-label">Flags</p>
      {flags.map((flag, index) => (
        <div key={flag.id} className="flag-item">
          <p className="flag-item-text">{flag.note}</p>
          <div className="flag-item-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={guardBusy(busyId === flag.id, () => handleAction(flag, index, 'canonical'))}
              {...busyProps(busyId === flag.id)}
            >
              Keep canonical
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={guardBusy(busyId === flag.id, () => handleAction(flag, index, 'updated'))}
              {...busyProps(busyId === flag.id)}
            >
              Update Codex
            </button>
            <button
              className="btn btn-ghost btn-sm danger"
              onClick={guardBusy(busyId === flag.id, () => handleAction(flag, index, 'ignored'))}
              {...busyProps(busyId === flag.id)}
            >
              Ignore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
