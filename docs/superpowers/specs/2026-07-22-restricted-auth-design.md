# Restricted registration & passwordless login

Date: 2026-07-22

## Context

Scriptorium is currently a solo, single-user app with no auth at all — any
request to `/api/*` is served unconditionally. This adds admin-gated
registration and passwordless (WebAuthn passkey) login, modeled directly on
`~/workspace/finance-tracker`'s auth system (NestJS), ported to this repo's
Express/Mongoose stack. Once a second account exists, each user's works
(and everything under them) must be private to that user.

## Non-goals

- No password-based login, ever.
- No passkey/device management UI beyond the one-time onboarding registration
  (matches finance-tracker's scope — no "your devices" settings page).
- No org/team sharing of works between users.
- No change to the AI provider/system-prompt behavior beyond scoping settings
  per user.

## Data model

### `User` (new)
```
email: String (unique, lowercase, indexed)
name: String
emailVerified: Boolean (default false)
createdAt: Date
```

### `OtpCode` (new)
```
email: String (lowercase, indexed)
purpose: 'register' | 'recovery'
codeHash: String (sha256 of the 6-digit code)
expiresAt: Date (TTL index, 10 min)
consumedAt: Date | null
attempts: Number (default 0, max 5 before code is dead)
```
Unique index on `{ email, purpose }` — issuing a new code overwrites any
live one for that email+purpose (upsert), same as finance-tracker.

### `Credential` (new — WebAuthn passkey)
```
userId: ObjectId (indexed)
credentialId: String (unique)
publicKey: Buffer
counter: Number
deviceLabel: String
createdAt: Date
```

### `WebauthnChallenge` (new)
```
userId: ObjectId
type: 'registration' | 'authentication'
challenge: String
expiresAt: Date (TTL index, 5 min)
```
`userId` is always known when the challenge is created: for registration
it's the caller's own `pending_passkey`/`full` session user; for login it's
resolved from the email submitted to `login/options` before the challenge
row is written.

### `AuthSession` (new — named to avoid collision with the existing writing
`Session` model)
```
tokenHash: String (sha256 of the session token, indexed)
userId: ObjectId
scope: 'pending_passkey' | 'full'
expiresAt: Date (TTL index)
```
`pending_passkey` TTL 15 min; `full` TTL `SESSION_TTL_DAYS` (default 30),
sliding — renewed when less than half the TTL remains.

### `AuditLog` (new)
```
userId: ObjectId
action: String  ('auth.otp_requested' | 'auth.registered' |
  'auth.recovery_started' | 'auth.login' | 'auth.logout' | 'passkey.added')
metadata: Mixed
createdAt: Date
```

### `Work` (modified)
Add `ownerId: { type: String, required: true, index: true }` (references
`User._id`). No other schema change; children (`Chapter`, `Codex`, `Map`,
`Catch`, writing `Session`) stay scoped by `workId` as today — ownership is
enforced once, at the `Work` boundary, not duplicated onto every child model.

### `Settings` (modified)
`_id` changes from the fixed string `'singleton'` to the owning user's id.
`getSettings(userId)` / `saveSettings(userId, partial)` replace the
zero-arg versions. Each user gets independent provider keys/generation
params.

## Server changes

### New services (`server/src/services/`)
- `otpService.js` — `issue(email, purpose)`, `verify(email, purpose, code)`.
  Direct port of finance-tracker's `otp.service.ts` (hash, TTL, attempt cap).
- `webauthnService.js` — wraps `@simplewebauthn/server`:
  `registrationOptions(userId, email)`, `verifyRegistration(userId, response, deviceLabel)`,
  `authenticationOptions(email)`, `verifyAuthentication(challengeId, response)`.
  Direct port of finance-tracker's `webauthn.service.ts`.
- `emailService.js` — Mailgun (`mailgun.js` + `form-data`), two calls:
  `sendOtpEmail(to, code)` (recovery — to the user) and
  `sendRegistrationRequestEmail(adminEmail, code, {name, email})`
  (registration — to `ADMIN_EMAIL`). Both `console.log` the code when
  `NODE_ENV !== 'production'`, matching finance-tracker's dev convenience.
- `authSessionService.js` — `create(userId, scope)`, `validate(token)`,
  `upgrade(sessionId)`, `destroy(token)`. Direct port of `session.service.ts`.
- `auditService.js` — `log({userId, action, metadata})`.
- `authService.js` — orchestrates the above: `startRegistration`,
  `startRecovery`, `verifyOtp`.

### New middleware (`server/src/middleware/`)
- `requireAuth.js` — reads the `sid` cookie, validates via
  `authSessionService`, 401s if missing/invalid. Accepts an
  `{ allowPending: true }` option for the two passkey-setup routes that must
  work on a `pending_passkey` session. Attaches `req.user = { id, email, scope }`.
- `emailThrottle.js` — in-memory sliding-window limiter keyed by `${ip}:${email}`
  from `req.body.email`, 5 requests/hour. Applied to `POST /auth/register`
  and `POST /auth/recover` only.
- `loadWork.js` — for every `/api/works/:workId...` sub-router: loads the
  `Work`, 404s if absent, 403s if `work.ownerId !== req.user.id`, sets
  `req.work`. Replaces the repeated `Work.findById(workId)` currently at the
  top of every handler in `chapters.js`, `codex.js`, `catches.js`, `map.js`,
  `sessions.js`, and `export.js` — those handlers use `req.work` instead.

### New routes — `server/src/routes/auth.js`
Mounted at `/api/auth`, unauthenticated except where noted:
```
POST /register            { name, email }              → throttled
POST /recover              { email }                    → throttled
POST /verify-otp           { email, code, purpose }
POST /passkey/options                                    → requireAuth(allowPending)
POST /passkey/verify        { response, deviceLabel }     → requireAuth(allowPending)
POST /login/options        { email }
POST /login/verify         { challengeId, response }
POST /logout                                              → requireAuth(allowPending)
GET  /me                                                  → requireAuth(allowPending)
```

### `server.js`
- `dotenv.config()` at the top (not currently called anywhere).
- `cookie-parser` middleware.
- Mount `authRouter` at `/api/auth` before the `requireAuth` gate.
- `requireAuth` applied to all other `/api/*` routers (works, chapters,
  codex, catches, map, sessions, export, ai, settings) — `/api/health` stays
  public.

### Existing routes touched
- `works.js`: `GET /` filters `{ ownerId: req.user.id }`; `POST /` sets
  `ownerId: req.user.id`; `:workId` routes gain `loadWork` and use `req.work`.
- `chapters.js`, `codex.js`, `catches.js`, `map.js`, `sessions.js`, `export.js`:
  mount `loadWork` in their router, drop their own `Work.findById` calls.
- `settings.js`: every `getSettings()`/`saveSettings()` call passes
  `req.user.id`.
- `ai.js`: every `complete({...})` call passes `userId: req.user.id`
  through to `llmService.complete`, which forwards it to `getSettings(userId)`.

### Env vars (new, `.env.example` + `docker-compose.yml`)
```
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM_EMAIL=
ADMIN_EMAIL=
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5173
WEBAUTHN_RP_NAME=Scriptorium
COOKIE_SECURE=false
SESSION_TTL_DAYS=30
```

### New dependencies
- server: `@simplewebauthn/server`, `mailgun.js`, `form-data`, `cookie-parser`
- client: `@simplewebauthn/browser`

## Client changes

- `client/src/context/AuthContext.jsx` — holds `{ user, status }`
  (`'loading' | 'authenticated' | 'pending_passkey' | 'anonymous'`), exposes
  `register`, `recover`, `verifyOtp`, `registerPasskey`, `login`, `logout`,
  backed by `GET /api/auth/me` on mount.
- `client/src/utils/api.js` — add `credentials: 'include'` so the `sid`
  cookie is sent; on a 401 response, callers redirect to `/login` (handled
  in `AuthContext`, not inside `apiFetch` itself, to avoid a hard reload).
- New pages under `client/src/pages/auth/`: `Login.jsx`, `Register.jsx`,
  `VerifyOtp.jsx`, `PasskeySetup.jsx`. Styled with the existing dark/gold
  theme in `index.css`, no new CSS system.
- `App.jsx`: wrap the existing `<Route path="/" element={<Layout />}>` tree
  in a `<RequireAuth>` element (redirects to `/login` if `status` isn't
  `authenticated`); add unauthenticated routes for `/login`, `/register`,
  `/verify-otp`, `/passkey-setup`.
- `main.jsx`: add `<AuthProvider>` around the existing provider stack (must
  wrap everything, since `WorksProvider` etc. now depend on being logged in).

## Testing plan

No test runner is configured in this repo. Verification is manual, via
docker-compose:
1. Register with `ADMIN_EMAIL` → confirm the OTP appears in server stdout
   (dev mode) → verify → add a passkey → land in the app.
2. Log out, log back in with the passkey.
3. Register a second email → confirm the admin-relay email (stdout) contains
   the second user's code, verify, add a passkey.
4. Confirm user A's `/api/works` list and direct `GET /api/works/:id` for
   user B's work return empty/403 respectively.
5. Hammer `POST /auth/register` 6x in a row from the same email → confirm
   the 6th is throttled.
6. Confirm `/api/health` and `/api/auth/*` work with no cookie; confirm every
   other `/api/*` route 401s with no cookie.
