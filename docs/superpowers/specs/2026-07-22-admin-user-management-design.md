# Admin User Management — Design

Date: 2026-07-22

## Purpose

Grant the operator-designated admin (identified by the existing `ADMIN_EMAIL`
env var) extra access after registering: a user management page listing all
registered users, with the ability to delete a user to revoke their access
and remove their data.

## Background

`ADMIN_EMAIL` already exists in this codebase — it's the address that
receives registration-request notification emails
(`server/src/services/authService.js:34`). This design reuses it as the
admin identity rather than introducing new configuration.

## Admin flag

- `User` model (`server/src/models/User.js`) gains:
  ```js
  isAdmin: { type: Boolean, default: false }
  ```
- In `authService.startRegistration`, only at *user creation* (not on
  re-registration of an existing unverified user), set `isAdmin: true` if
  `normalized === process.env.ADMIN_EMAIL?.toLowerCase()`.
- No promotion/demotion UI. Admin status is fixed at registration time by
  matching `ADMIN_EMAIL`. If `ADMIN_EMAIL` changes later, it does not
  retroactively change existing users' `isAdmin` flag.
- `requireAuth` middleware (`server/src/middleware/requireAuth.js`) adds
  `isAdmin` to `req.user`.
- `GET /api/auth/me` returns `isAdmin` in its response.

## `requireAdmin` middleware

New file `server/src/middleware/requireAdmin.js`. Used *after*
`requireAuth()` on a route:

```js
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return next(httpError(403, 'FORBIDDEN', 'Admin access required'));
  next();
}
```

## Admin routes

New file `server/src/routes/admin.js`, mounted at `/api/admin` in
`server.js`. All routes use `requireAuth()` then `requireAdmin`.

### `GET /api/admin/users`

Returns all users:

```json
[{ "id": "...", "email": "...", "name": "...", "emailVerified": true, "isAdmin": false, "createdAt": "..." }]
```

Sorted by `createdAt` ascending.

### `DELETE /api/admin/users/:userId`

Deletes a user and cascades their owned data. Safety rails, checked in
order, each returning `400 INVALID_REQUEST` with a descriptive message:

1. `userId === req.user.id` → reject (can't delete yourself via this page).
2. Target user `isAdmin === true` and is the only admin in the system →
   reject (prevents total admin lockout).
3. Target user not found → `404 NOT_FOUND`.

Cascade, once checks pass:

- For every `Work` where `ownerId === userId`: delete the `Work` and its
  `Chapter`, `Codex`, `Map`, `Catch`, `Session` children. This repeats the
  per-work cascade already in `routes/works.js` (`DELETE /:workId`) — that
  logic is extracted into a shared helper
  `server/src/services/workService.js#deleteWorkCascade(workId)` and both
  `works.js` and `admin.js` call it, instead of duplicating the
  `Promise.all([...])` block.
- Delete `Settings` where `_id === userId`.
- Delete `Credential` where `userId === userId`.
- Delete `AuthSession` where `userId === userId` (immediately revokes any
  active sessions for the deleted user).
- Delete `WebauthnChallenge` where `userId === userId`.
- Delete the `User` document itself.
- `AuditLog` entries referencing the deleted user are **kept** — audit logs
  are a historical record, not user-owned data — and a new
  `admin.user_deleted` entry is logged for the *acting* admin
  (`userId: req.user.id`, `metadata: { deletedUserId, deletedEmail }`).
- `OtpCode` rows are keyed by email, not userId, and already self-expire via
  TTL index; left untouched.

Responds `204 No Content` on success.

## Client

- `AuthContext` (`client/src/context/AuthContext.jsx`): the `user` object
  from `/auth/me` now includes `isAdmin`; no context shape changes needed
  beyond that.
- New guard component `client/src/components/auth/RequireAdmin.jsx`:
  redirects to `/` if `user.isAdmin` is not `true` (mirrors the existing
  `RequireAuth` pattern).
- New page `client/src/pages/admin/UserManagement.jsx`:
  - Table: email, name, verified badge, admin badge, joined date, delete
    action.
  - Delete button is disabled (with a tooltip/explanation) for the current
    admin's own row and for a target admin when they're the only admin —
    mirroring the server-side rails so the UI doesn't invite a request that
    will just 400.
  - Deleting asks for confirmation (reuse whatever confirm/modal pattern
    the app already uses elsewhere, e.g. work deletion) before calling
    `DELETE /api/admin/users/:userId`, then refreshes the list.
- `App.jsx`: new route `/admin/users`, nested under the existing
  `RequireAuth`-wrapped `Layout` route, additionally wrapped in
  `RequireAdmin`.
- `Sidebar.jsx`: show a "Manage Users" link only when `user.isAdmin` is
  `true`.

## Out of scope

- No UI or API to promote/demote admin status after registration.
- No multi-admin support beyond "whoever's email matches `ADMIN_EMAIL` at
  registration time" — if `ADMIN_EMAIL` is a single value, there is
  normally exactly one admin, but the "only admin" lockout check exists in
  case of manual DB edits or a future change to multi-admin config.
- No pagination on the user list (acceptable for a solo/small-scale app;
  revisit if the user base grows).

## Testing

No test runner is configured in this repo (per `CLAUDE.md`). Verification
will be manual: register as `ADMIN_EMAIL`, confirm the admin link appears
and the user list loads; register a second, non-admin account and confirm
it appears in the list and can be deleted along with its data; confirm
self-delete and last-admin-delete are blocked with clear errors.
