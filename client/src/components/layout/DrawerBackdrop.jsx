import { useUI } from '../../context/UIContext.jsx';
import { useLayoutMode } from '../../hooks/useLayoutMode.js';

// The dimmed layer behind an open drawer; a tap on it closes the drawer
export default function DrawerBackdrop() {
  const { state, dispatch } = useUI();
  const mode = useLayoutMode();
  // Desktop has no drawers; a drawer left open while the window widened is closed a moment later
  if (!state.drawer || mode === 'desktop') return null;
  return <div className="drawer-backdrop" aria-hidden="true" onClick={() => dispatch({ type: 'CLOSE_DRAWER' })} />;
}
