# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator-designated admin (email matching `ADMIN_EMAIL`) see a user management page listing all registered users and delete a user to fully revoke their access and remove their data.

**Architecture:** Add an `isAdmin` flag to `User`, set at registration time by matching `ADMIN_EMAIL`. Add a `requireAdmin` middleware and an `/api/admin` router with list/delete endpoints. Extract the existing per-work cascade-delete logic out of `routes/works.js` into a shared `workService.deleteWorkCascade` helper so the admin delete route can reuse it instead of duplicating it. Add a React admin page gated by a `RequireAdmin` guard, linked from the sidebar only for admins.

**Tech Stack:** Express + Mongoose (server), React 18 + react-router-dom (client). No test runner is configured in this repo — verification is manual via `curl` and the browser, per `CLAUDE.md`.

## Global Constraints

- Server and client are both ESM (`"type": "module"`).
- New endpoints must live under `/api/*` so Vite's dev proxy forwards them.
- Styling is plain CSS in `client/src/index.css` (dark theme, CSS vars, Georgia serif, gold accent `#c9a96e`) — no CSS-in-JS, no new styling libraries.
- No test runner/linter configured — verify manually with `curl` against the running dev server and by exercising the UI in a browser.
- Follow existing patterns: Mongoose models use `_id: { type: String }` + `idTransform` for `id` mapping where the model is returned to the client directly; route handlers use `httpError(status, code, message)` and `next(err)`; client API calls go through `client/src/utils/api.js`'s `api.get/post/put/delete`.

---

### Task 1: `isAdmin` field on `User` + set at registration

**Files:**
- Modify: `server/src/models/User.js`
- Modify: `server/src/services/authService.js` (`startRegistration`, ~lines 12-36)

**Interfaces:**
- Produces: `User.isAdmin: Boolean` (default `false`), persisted and returned via the model's existing `idTransform` toJSON.

- [ ] **Step 1: Add the field to the model**

In `server/src/models/User.js`, add `isAdmin` to the schema:

```js
const userSchema = new mongoose.Schema(
  {
    _id: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);
```

- [ ] **Step 2: Set `isAdmin` on new-user creation in `startRegistration`**

In `server/src/services/authService.js`, the relevant block currently reads:

```js
  const user =
    existing ||
    (await User.create({
      _id: `user_${shortId()}`,
      email: normalized,
      name,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    }));
```

Change it to:

```js
  const user =
    existing ||
    (await User.create({
      _id: `user_${shortId()}`,
      email: normalized,
      name,
      emailVerified: false,
      isAdmin: normalized === process.env.ADMIN_EMAIL?.toLowerCase(),
      createdAt: new Date().toISOString(),
    }));
```

This only runs on the `existing || User.create(...)` branch, so `isAdmin` is set once, at creation, and never retroactively changed on re-registration of an existing unverified user.

- [ ] **Step 3: Manual verification**

Start the stack (`wsl -d ubuntu -e docker-compose up --build` or server+client separately per `CLAUDE.md`), with `ADMIN_EMAIL=admin@test.local` set in the server environment. Register with that exact email through the UI (or `curl -X POST localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Admin","email":"admin@test.local"}'`), complete OTP + passkey setup, then check Mongo:

```bash
docker exec -it <mongo-container> mongosh scriptorium --eval 'db.users.findOne({email:"admin@test.local"})'
```

Expected: the document has `isAdmin: true`. Register a second account with a different email and confirm its `isAdmin` is `false`.

- [ ] **Step 4: Commit**

```bash
git add server/src/models/User.js server/src/services/authService.js
git commit -m "feat(server): flag the ADMIN_EMAIL account as admin at registration"
```

---

### Task 2: Surface `isAdmin` through auth (`requireAuth`, `/auth/me`)

**Files:**
- Modify: `server/src/middleware/requireAuth.js`
- Modify: `server/src/routes/auth.js` (`GET /me`, line 110-112)

**Interfaces:**
- Consumes: `User.isAdmin` from Task 1.
- Produces: `req.user.isAdmin: boolean` (available to every route behind `requireAuth`), and `GET /api/auth/me` response now includes `isAdmin`.

- [ ] **Step 1: Add `isAdmin` to `req.user`**

In `server/src/middleware/requireAuth.js`, the line:

```js
      req.user = { id: user._id, email: user.email, scope: session.scope, sessionId: session.sessionId };
```

becomes:

```js
      req.user = { id: user._id, email: user.email, scope: session.scope, sessionId: session.sessionId, isAdmin: user.isAdmin };
```

- [ ] **Step 2: Return `isAdmin` from `/auth/me`**

In `server/src/routes/auth.js`, the handler:

```js
router.get('/me', requireAuth({ allowPending: true }), (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, scope: req.user.scope });
});
```

becomes:

```js
router.get('/me', requireAuth({ allowPending: true }), (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, scope: req.user.scope, isAdmin: req.user.isAdmin });
});
```

- [ ] **Step 3: Manual verification**

With the admin account from Task 1 logged in:

```bash
curl -s localhost:3001/api/auth/me -H "Cookie: sid=<paste admin sid cookie>"
```

Expected: JSON includes `"isAdmin":true`. Repeat with the non-admin account's cookie — expected `"isAdmin":false`.

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/requireAuth.js server/src/routes/auth.js
git commit -m "feat(server): surface isAdmin on req.user and GET /auth/me"
```

---

### Task 3: Extract shared work-cascade-delete helper

**Files:**
- Create: `server/src/services/workService.js`
- Modify: `server/src/routes/works.js` (`DELETE /:workId`, lines 87-106)

**Interfaces:**
- Produces: `async function deleteWorkCascade(workId)` — deletes `Chapter`, `Codex`, `Map`, `Catch`, `Session` documents where `workId` matches. Does **not** delete the `Work` document itself or check ownership; callers delete the `Work` (with their own ownership/authorization query) before calling this.

- [ ] **Step 1: Create the shared helper**

`server/src/services/workService.js`:

```js
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import CatchModel from '../models/Catch.js';
import Session from '../models/Session.js';

export async function deleteWorkCascade(workId) {
  await Promise.all([
    Chapter.deleteMany({ workId }),
    Codex.deleteMany({ workId }),
    MapModel.deleteMany({ workId }),
    CatchModel.deleteMany({ workId }),
    Session.deleteMany({ workId }),
  ]);
}
```

- [ ] **Step 2: Use it from `routes/works.js`**

Replace the imports at the top of `server/src/routes/works.js`:

```js
import { Router } from 'express';
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import CatchModel from '../models/Catch.js';
import Session from '../models/Session.js';
import { httpError } from '../middleware/errorHandler.js';
```

with:

```js
import { Router } from 'express';
import Work from '../models/Work.js';
import { deleteWorkCascade } from '../services/workService.js';
import { httpError } from '../middleware/errorHandler.js';
```

And replace the `DELETE /:workId` handler body:

```js
// DELETE /api/works/:workId
router.delete('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const deleted = await Work.findOneAndDelete({ _id: workId, ownerId: req.user.id });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    await Promise.all([
      Chapter.deleteMany({ workId }),
      Codex.deleteMany({ workId }),
      MapModel.deleteMany({ workId }),
      CatchModel.deleteMany({ workId }),
      Session.deleteMany({ workId }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

with:

```js
// DELETE /api/works/:workId
router.delete('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const deleted = await Work.findOneAndDelete({ _id: workId, ownerId: req.user.id });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    await deleteWorkCascade(workId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Manual verification**

With any logged-in user that owns a work with at least one chapter, delete it via the UI (Shelves → work card menu → Delete → Confirm Delete?) or:

```bash
curl -s -X DELETE localhost:3001/api/works/<workId> -H "Cookie: sid=<paste sid cookie>" -o /dev/null -w '%{http_code}\n'
```

Expected: `204`. Confirm in Mongo that `chapters`, `codices` (or whatever the Codex collection is named), `maps`, `catches`, `sessions` no longer have documents with that `workId`. This confirms the extraction preserved behavior.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/workService.js server/src/routes/works.js
git commit -m "refactor(server): extract work cascade-delete into workService"
```

---

### Task 4: `requireAdmin` middleware

**Files:**
- Create: `server/src/middleware/requireAdmin.js`

**Interfaces:**
- Consumes: `req.user.isAdmin` (set by `requireAuth`, Task 2). Must be mounted **after** `requireAuth()` on any route.
- Produces: `requireAdmin(req, res, next)` — an Express middleware function (not a factory, unlike `requireAuth`).

- [ ] **Step 1: Write the middleware**

`server/src/middleware/requireAdmin.js`:

```js
import { httpError } from './errorHandler.js';

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return next(httpError(403, 'FORBIDDEN', 'Admin access required'));
  next();
}
```

- [ ] **Step 2: Manual verification**

This middleware has no route wired to it yet — Task 5 wires it up and is where it gets exercised. No standalone verification needed; skip to commit.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/requireAdmin.js
git commit -m "feat(server): add requireAdmin middleware"
```

---

### Task 5: Admin routes — list and delete users

**Files:**
- Create: `server/src/routes/admin.js`
- Modify: `server/src/server.js` (mount the router)

**Interfaces:**
- Consumes: `requireAuth()` (existing), `requireAdmin` (Task 4), `deleteWorkCascade` (Task 3), `auditService.log` (existing, `server/src/services/auditService.js`).
- Produces: `GET /api/admin/users`, `DELETE /api/admin/users/:userId`.

- [ ] **Step 1: Write the admin router**

`server/src/routes/admin.js`:

```js
import { Router } from 'express';
import User from '../models/User.js';
import Work from '../models/Work.js';
import Settings from '../models/Settings.js';
import Credential from '../models/Credential.js';
import AuthSession from '../models/AuthSession.js';
import WebauthnChallenge from '../models/WebauthnChallenge.js';
import { deleteWorkCascade } from '../services/workService.js';
import * as auditService from '../services/auditService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return next(httpError(400, 'INVALID_REQUEST', "You can't delete your own account from this page."));
    }

    const target = await User.findById(userId);
    if (!target) return next(httpError(404, 'NOT_FOUND', 'User not found'));

    if (target.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return next(httpError(400, 'INVALID_REQUEST', 'Cannot delete the only admin account.'));
      }
    }

    const works = await Work.find({ ownerId: userId }).select('_id');
    for (const work of works) {
      await Work.deleteOne({ _id: work._id });
      await deleteWorkCascade(work._id);
    }

    await Promise.all([
      Settings.deleteOne({ _id: userId }),
      Credential.deleteMany({ userId }),
      AuthSession.deleteMany({ userId }),
      WebauthnChallenge.deleteMany({ userId }),
      User.deleteOne({ _id: userId }),
    ]);

    await auditService.log({
      userId: req.user.id,
      action: 'admin.user_deleted',
      metadata: { deletedUserId: userId, deletedEmail: target.email },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Mount the router in `server.js`**

In `server/src/server.js`, add the import near the other route imports:

```js
import settingsRouter from './routes/settings.js';
import adminRouter from './routes/admin.js';
```

And add `requireAdmin` to the middleware imports:

```js
import { requireAuth } from './middleware/requireAuth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
```

Then mount it alongside the other authenticated routes:

```js
app.use('/api/settings', auth, settingsRouter);
app.use('/api/admin', auth, requireAdmin, adminRouter);
```

- [ ] **Step 3: Manual verification**

Using the admin account's session cookie:

```bash
curl -s localhost:3001/api/admin/users -H "Cookie: sid=<admin sid>" | jq .
```

Expected: a JSON array including both the admin and any other registered test users, each with `id`, `email`, `name`, `emailVerified`, `isAdmin`, `createdAt`.

Using the non-admin account's session cookie against the same URL:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/admin/users -H "Cookie: sid=<non-admin sid>"
```

Expected: `403`.

Attempt self-delete as admin:

```bash
curl -s -X DELETE localhost:3001/api/admin/users/<admin userId> -H "Cookie: sid=<admin sid>"
```

Expected: `400` with `INVALID_REQUEST`.

Delete the non-admin test user (create a throwaway work for them first so the cascade has something to remove):

```bash
curl -s -X DELETE localhost:3001/api/admin/users/<other userId> -H "Cookie: sid=<admin sid>" -o /dev/null -w '%{http_code}\n'
```

Expected: `204`. Confirm in Mongo that the `users` document, their `works` (and cascaded children), `settings`, `credentials`, and `authsessions` for that userId are all gone, and that an `auditlogs` document with `action: "admin.user_deleted"` was created.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/admin.js server/src/server.js
git commit -m "feat(server): add admin routes to list and delete users"
```

---

### Task 6: Client — `RequireAdmin` guard and `isAdmin` on auth state

**Files:**
- Create: `client/src/components/auth/RequireAdmin.jsx`

**Interfaces:**
- Consumes: `useAuth()` from `client/src/context/AuthContext.jsx` — `user` object already carries whatever `/auth/me` returns (Task 2 added `isAdmin` to that response, so no `AuthContext.jsx` changes are needed; `user.isAdmin` is already available).
- Produces: `<RequireAdmin>{children}</RequireAdmin>` component — renders `children` if `user.isAdmin` is `true`, otherwise redirects to `/`.

- [ ] **Step 1: Write the guard**

`client/src/components/auth/RequireAdmin.jsx`:

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function RequireAdmin({ children }) {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 2: Manual verification**

Deferred to Task 8, once there's a route to guard. Skip to commit.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/RequireAdmin.jsx
git commit -m "feat(client): add RequireAdmin route guard"
```

---

### Task 7: Client — `UserManagement` page

**Files:**
- Create: `client/src/pages/admin/UserManagement.jsx`
- Modify: `client/src/index.css` (append admin-page styles)

**Interfaces:**
- Consumes: `api.get('/admin/users')`, `api.delete('/admin/users/:id')` from `client/src/utils/api.js`; `useAuth()` for the current user's `id` (to disable the self-delete button).
- Produces: default-exported `UserManagement` React component.

- [ ] **Step 1: Write the page**

`client/src/pages/admin/UserManagement.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.get('/admin/users'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const adminCount = users.filter((u) => u.isAdmin).length;

  async function handleDelete(u) {
    if (confirmingId !== u.id) {
      setConfirmingId(u.id);
      return;
    }
    setBusyId(u.id);
    setError(null);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  function deleteDisabledReason(u) {
    if (u.id === currentUser?.id) return "You can't delete your own account.";
    if (u.isAdmin && adminCount <= 1) return 'Cannot delete the only admin account.';
    return undefined;
  }

  if (loading) {
    return <div className="loading-page"><p className="loading-text">Loading users…</p></div>;
  }

  return (
    <div className="settings-page admin-users-page">
      <div className="settings-header">
        <h1 className="settings-title">User Management</h1>
      </div>

      {error && <p className="error-text settings-error">{error}</p>}

      <table className="admin-users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Verified</th>
            <th>Admin</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const disabledReason = deleteDisabledReason(u);
            const isConfirming = confirmingId === u.id;
            return (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.emailVerified ? 'Yes' : 'No'}</td>
                <td>{u.isAdmin ? 'Admin' : ''}</td>
                <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</td>
                <td>
                  <button
                    className={isConfirming ? 'danger-confirm' : 'danger'}
                    disabled={!!disabledReason || busyId === u.id}
                    title={disabledReason}
                    onClick={() => handleDelete(u)}
                  >
                    {busyId === u.id ? 'Deleting…' : isConfirming ? 'Confirm Delete?' : 'Delete'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `client/src/index.css`, after the existing `.settings-*` block (around line 2200, right after the `Settings` section ends):

```css
/* ============================================================
   Admin — User Management
   ============================================================ */
.admin-users-page {
  max-width: 900px;
}

.admin-users-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.admin-users-table th,
.admin-users-table td {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.admin-users-table th {
  color: var(--text-muted);
  font-weight: normal;
  font-size: 0.85rem;
}

.admin-users-table tr:last-child td {
  border-bottom: none;
}

.admin-users-table button.danger {
  background: none;
  border: 1px solid var(--error);
  color: var(--error);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.admin-users-table button.danger-confirm {
  background: var(--error);
  border: 1px solid var(--error);
  color: var(--bg);
  font-weight: bold;
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.admin-users-table button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Manual verification**

Deferred to Task 8, once the route exists to render this page. Skip to commit.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/UserManagement.jsx client/src/index.css
git commit -m "feat(client): add admin user management page"
```

---

### Task 8: Wire up route and sidebar link

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: `RequireAdmin` (Task 6), `UserManagement` (Task 7), `useAuth()` for `user.isAdmin`.

- [ ] **Step 1: Add the route**

In `client/src/App.jsx`, add imports:

```jsx
import RequireAuth from './components/auth/RequireAuth.jsx';
import RequireAdmin from './components/auth/RequireAdmin.jsx';
import UserManagement from './pages/admin/UserManagement.jsx';
```

(`RequireAuth` import already exists — just add `RequireAdmin` and `UserManagement` alongside it.)

Add a nested route inside the existing `RequireAuth`-wrapped `Layout` route, after `settings`:

```jsx
        <Route path="settings" element={<Settings />} />
        <Route
          path="admin/users"
          element={
            <RequireAdmin>
              <UserManagement />
            </RequireAdmin>
          }
        />
```

- [ ] **Step 2: Add the sidebar link**

In `client/src/components/layout/Sidebar.jsx`, `useAuth()` is already imported and used for `logout`; also destructure `user`:

```jsx
  const { logout, user } = useAuth();
```

In the `sidebar-bottom` block, add a conditional nav item before the logout button:

```jsx
      <div className="sidebar-bottom">
        {user?.isAdmin && (
          <NavItem
            to="/admin/users"
            icon="👤"
            label="Manage Users"
            active={isActive('/admin/users')}
          />
        )}
        <NavItem
          to="/settings"
          icon="⚙"
          label="Settings"
          active={isActive('/settings')}
        />
```

- [ ] **Step 3: Manual verification**

Run the full stack. Log in as the admin account (from Task 1) — confirm "Manage Users" appears in the sidebar, clicking it loads the table of all registered users, and deleting a non-admin test user works end-to-end through the UI (click Delete → button becomes "Confirm Delete?" → click again → row disappears). Log in as a non-admin account — confirm "Manage Users" does NOT appear in the sidebar, and navigating directly to `/admin/users` redirects to `/`.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/layout/Sidebar.jsx
git commit -m "feat(client): wire up admin user management route and nav link"
```
