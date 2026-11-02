import { useCallback, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLayoutMode } from '../../hooks/useLayoutMode.js';
import { useDrawer } from '../../hooks/useDrawer.js';
import DrawerClose from './DrawerClose.jsx';

const SLIDE = 'top 0.22s cubic-bezier(0.4,0,0.2,1), height 0.22s cubic-bezier(0.4,0,0.2,1)';

// `icon` names the drawn icon (see Ornaments in index.css); it is decoration, so screen readers skip it
function NavItem({ to, icon, label, active }) {
  return (
    <Link to={to} className={`sidebar-nav-item${active ? ' active' : ''}`}>
      <span className={`sidebar-nav-icon ic ic-${icon}`} aria-hidden="true" />
      <span className="sidebar-nav-label">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { workId } = useParams();
  const { state } = useActiveWork();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const activeWorkId = workId || (state.work ? state.work.id : null);
  const sidebarRef = useRef(null);
  const indicatorRef = useRef(null);
  const mounted = useRef(false);
  // Phones and tablets get the nav as a left drawer; desktop leaves it inline
  const mode = useLayoutMode();
  const drawer = useDrawer('nav', mode === 'desktop' ? null : 'left', 'Rooms menu');
  const { ref: drawerRef, ...drawerAttrs } = drawer.attrs;
  const setNavRef = useCallback(
    (el) => {
      sidebarRef.current = el;
      if (drawerRef) drawerRef.current = el;
    },
    [drawerRef]
  );

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
    <nav className={`sidebar${drawer.className}`} ref={setNavRef} aria-label="Rooms" {...drawerAttrs}>
      {drawer.isDrawer && <DrawerClose label="menu" onClose={drawer.close} />}
      <div ref={indicatorRef} className="sidebar-nav-indicator" />

      <div className="sidebar-brand">
        <Link to="/" className="sidebar-brand-link">
          <span className="rose" aria-hidden="true" />
          Scriptorium
        </Link>
      </div>

      <div className="sidebar-nav">
        <NavItem
          to="/"
          icon="shelves"
          label="Shelves"
          active={location.pathname === '/'}
        />

        {activeWorkId && (
          <>
            <NavItem
              to={`/work/${activeWorkId}`}
              icon="room"
              label="Main Room"
              active={
                location.pathname === `/work/${activeWorkId}` ||
                location.pathname.startsWith(`/work/${activeWorkId}/chapter`)
              }
            />
            <NavItem
              to={`/work/${activeWorkId}/map`}
              icon="map"
              label="Map"
              active={isActive(`/work/${activeWorkId}/map`)}
            />
            <NavItem
              to={`/work/${activeWorkId}/codex`}
              icon="codex"
              label="Codex"
              active={isActive(`/work/${activeWorkId}/codex`)}
            />
          </>
        )}
      </div>

      <div className="sidebar-bottom">
        {user?.isAdmin && (
          <NavItem
            to="/admin/users"
            icon="users"
            label="Manage Users"
            active={isActive('/admin/users')}
          />
        )}
        <NavItem
          to="/settings"
          icon="settings"
          label="Settings"
          active={isActive('/settings')}
        />
        <button
          type="button"
          className="sidebar-nav-item sidebar-logout"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <span className="sidebar-nav-icon ic ic-out" aria-hidden="true" />
          <span className="sidebar-nav-label">Log out</span>
        </button>
      </div>
    </nav>
  );
}
