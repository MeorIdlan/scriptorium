import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';

const SLIDE = 'top 0.22s cubic-bezier(0.4,0,0.2,1), height 0.22s cubic-bezier(0.4,0,0.2,1)';

function NavItem({ to, icon, label, active }) {
  return (
    <Link to={to} className={`sidebar-nav-item${active ? ' active' : ''}`}>
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { workId } = useParams();
  const { state } = useActiveWork();
  const activeWorkId = workId || (state.work ? state.work.id : null);
  const sidebarRef = useRef(null);
  const indicatorRef = useRef(null);
  const mounted = useRef(false);

  const isActive = (path) => location.pathname === path;

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const indicator = indicatorRef.current;
    if (!sidebar || !indicator) return;

    const active = sidebar.querySelector('.sidebar-nav-item.active');
    if (!active) {
      indicator.style.opacity = '0';
      return;
    }

    const sidebarRect = sidebar.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const top = itemRect.top - sidebarRect.top;
    const height = itemRect.height;

    indicator.style.transition = mounted.current ? SLIDE : 'none';
    indicator.style.top = `${top}px`;
    indicator.style.height = `${height}px`;
    indicator.style.opacity = '1';
    mounted.current = true;
  }, [location.pathname, activeWorkId]);

  return (
    <nav className="sidebar" ref={sidebarRef}>
      <div ref={indicatorRef} className="sidebar-nav-indicator" />

      <div className="sidebar-brand">
        <Link to="/" className="sidebar-brand-link">Scriptorium</Link>
      </div>

      <div className="sidebar-nav">
        <NavItem
          to="/"
          icon="☰"
          label="Shelves"
          active={location.pathname === '/'}
        />

        {activeWorkId && (
          <>
            <NavItem
              to={`/work/${activeWorkId}`}
              icon="✍"
              label="Main Room"
              active={
                location.pathname === `/work/${activeWorkId}` ||
                location.pathname.startsWith(`/work/${activeWorkId}/chapter`)
              }
            />
            <NavItem
              to={`/work/${activeWorkId}/map`}
              icon="◈"
              label="Map"
              active={isActive(`/work/${activeWorkId}/map`)}
            />
            <NavItem
              to={`/work/${activeWorkId}/codex`}
              icon="⊞"
              label="Codex"
              active={isActive(`/work/${activeWorkId}/codex`)}
            />
          </>
        )}
      </div>

      <div className="sidebar-bottom">
        <NavItem
          to="/settings"
          icon="⚙"
          label="Settings"
          active={isActive('/settings')}
        />
      </div>
    </nav>
  );
}
