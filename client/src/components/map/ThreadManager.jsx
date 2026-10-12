import { useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import ThreadRow from './ThreadRow.jsx';
import { threadNameError, threadTagCount } from '../../utils/threads.js';

// The work's plot threads, on the Map. Every write reloads the list via onChanged.
export default function ThreadManager({ workId, threads, chapters, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [errors, setErrors] = useState({});
  const creating = useRef(false);
  const addingRef = useRef(false); // readable by a blur that fires while the field unmounts
  const base = `/works/${workId}/threads`;

  // Resolves true on success; on failure the server's message shows under the row
  const run = async (key, write) => {
    try {
      await write();
      setErrors((e) => ({ ...e, [key]: null }));
      await onChanged();
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message }));
      return false;
    }
  };

  const openNew = () => {
    addingRef.current = true;
    setAdding(true);
  };
  const cancelNew = () => {
    addingRef.current = false;
    setAdding(false);
    setNewName('');
    setErrors((e) => ({ ...e, new: null }));
  };
  const newError = newName.trim() ? threadNameError(newName) : null;
  const create = async () => {
    if (creating.current || !addingRef.current) return;
    if (!newName.trim()) return cancelNew();
    if (newError) return;
    creating.current = true;
    try {
      if (await run('new', () => api.post(base, { name: newName.trim() }))) {
        addingRef.current = false;
        setAdding(false);
        setNewName('');
      }
    } finally {
      creating.current = false;
    }
  };
  const onNewKey = (e) => {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') cancelNew();
  };

  return (
    <section className="thread-manager">
      <div className="thread-manager-head">
        <h3 className="thread-manager-title">Plot threads</h3>
        {!adding && (
          <button className="btn btn-secondary btn-sm" onClick={openNew}>
            New thread
          </button>
        )}
      </div>
      {threads.length === 0 && !adding && (
        <p className="chapter-detail-muted">No plot threads yet. Add the subplots and mysteries you need to keep track of.</p>
      )}
      <ul className="thread-list">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            tagCount={threadTagCount(chapters, thread.id)}
            error={errors[thread.id]}
            onSave={(fields) => run(thread.id, () => api.put(`${base}/${thread.id}`, fields))}
            onDelete={() => run(thread.id, () => api.delete(`${base}/${thread.id}`))}
          />
        ))}
        {adding && (
          <li className="thread-row thread-new">
            <input
              type="text"
              className="form-input thread-new-name"
              aria-label="New thread name"
              placeholder="Name the thread"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={onNewKey}
              onBlur={create}
              autoFocus
            />
            {newError && <p className="field-error">{newError}</p>}
            {errors.new && <p className="field-error">{errors.new}</p>}
          </li>
        )}
      </ul>
    </section>
  );
}
