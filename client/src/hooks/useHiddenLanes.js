import { useCallback, useEffect, useState } from 'react';

const keyFor = (workId) => `scriptorium.hiddenLanes.${workId}`;

// Which thread lanes the writer hid on the Map, remembered per work in this
// browser. Storage can be missing, blocked or hold junk, so every access is
// guarded and the lanes simply start shown.
function read(workId) {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(workId)));
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function write(workId, ids) {
  try {
    localStorage.setItem(keyFor(workId), JSON.stringify(ids));
  } catch {
    // The choice still holds for this visit
  }
}

export default function useHiddenLanes(workId) {
  const [hidden, setHidden] = useState(() => read(workId));

  useEffect(() => {
    setHidden(read(workId));
  }, [workId]);

  const setShown = useCallback(
    (threadId, shown) => {
      setHidden((current) => {
        const next = shown ? current.filter((id) => id !== threadId) : [...new Set([...current, threadId])];
        write(workId, next);
        return next;
      });
    },
    [workId]
  );

  return { isHidden: (threadId) => hidden.includes(threadId), setShown };
}
