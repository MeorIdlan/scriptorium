import { useUI } from '../../context/UIContext.jsx';

// The dimmed layer behind an open drawer; a tap on it closes the drawer
export default function DrawerBackdrop() {
  const { state, dispatch } = useUI();
  if (!state.drawer) return null;
  return <div className="drawer-backdrop" aria-hidden="true" onClick={() => dispatch({ type: 'CLOSE_DRAWER' })} />;
}
