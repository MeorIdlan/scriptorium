import { useEffect, useRef } from 'react';
import { api } from '../utils/api.js';

// Records a writing session for as long as the Main Room is open on a work.
// The server fills in word counts from the work, so ending only needs the
// last chapter. Ending uses a keepalive fetch so it survives a tab close.
export function useWritingSession(workId, chapterId) {
  const chapterIdRef = useRef(chapterId);
  chapterIdRef.current = chapterId;

  useEffect(() => {
    if (!workId) return;
    let sessionId = null;
    let ended = false;

    function end() {
      if (!sessionId || ended) return;
      ended = true;
      fetch(`/api/works/${workId}/sessions/${sessionId}/end`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({ chapterId: chapterIdRef.current || undefined }),
      }).catch(() => {});
    }

    api
      .post(`/works/${workId}/sessions`, {})
      .then((session) => {
        sessionId = session.id;
        // Unmounted before the session was created
        if (ended) {
          ended = false;
          end();
        }
      })
      .catch((err) => console.error('Failed to start session:', err));

    window.addEventListener('pagehide', end);
    return () => {
      window.removeEventListener('pagehide', end);
      if (sessionId) end();
      else ended = true;
    };
  }, [workId]);
}
