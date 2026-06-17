import { useEffect } from 'react';
import { useUI } from '../context/UIContext.jsx';

export function useCatch() {
  const { dispatch } = useUI();

  useEffect(() => {
    function handleKeyDown(e) {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        dispatch({ type: 'OPEN_CATCH' });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
}
