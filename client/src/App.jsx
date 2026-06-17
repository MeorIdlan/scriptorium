import { useEffect } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar.jsx';
import TopBar from './components/layout/TopBar.jsx';
import CatchOverlay from './components/overlays/CatchOverlay.jsx';
import ExportModal from './components/overlays/ExportModal.jsx';
import Shelves from './pages/Shelves.jsx';
import MainRoom from './pages/MainRoom.jsx';
import MapView from './pages/MapView.jsx';
import CodexView from './pages/CodexView.jsx';
import Settings from './pages/Settings.jsx';
import { useUI } from './context/UIContext.jsx';

function Layout() {
  const location = useLocation();
  const { dispatch } = useUI();

  // Global keyboard shortcut: Ctrl/Cmd+Shift+I → Catch overlay
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

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-area">
        <TopBar />
        <div className="content">
          <div key={location.key} className="page-enter">
            <Outlet />
          </div>
        </div>
      </div>
      <CatchOverlay />
      <ExportModal />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Shelves />} />
        <Route path="work/:workId" element={<MainRoom />} />
        <Route path="work/:workId/chapter/:chapterId" element={<MainRoom />} />
        <Route path="work/:workId/map" element={<MapView />} />
        <Route path="work/:workId/codex" element={<CodexView />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
