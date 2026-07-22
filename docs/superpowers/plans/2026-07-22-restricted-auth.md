# Restricted Registration & Passwordless Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-gated registration, WebAuthn passkey (passwordless) login, per-email/IP throttling, an audit log, and per-user data isolation to Scriptorium, which currently has no auth at all.

**Architecture:** Express middleware (`requireAuth`) validates a `sid` httpOnly cookie against a Mongo-backed `AuthSession` collection and attaches `req.user`. Registration is admin-approved: a requester's OTP is emailed to `ADMIN_EMAIL`, who relays it to the requester. Verified users must then register a WebAuthn passkey before their session is upgraded from `pending_passkey` to `full`. Every `Work` gains an `ownerId`; a new `loadWork` middleware enforces per-owner access at the one chokepoint all child routes already pass through.

**Tech Stack:** `@simplewebauthn/server` / `@simplewebauthn/browser` (passkeys), `mailgun.js` + `form-data` (email), `cookie-parser` (cookie reading), Node's built-in `crypto` (OTP hashing, session tokens) — no new state store, no test runner (none exists in this repo; verification is manual per CLAUDE.md).

## Global Constraints

- OTP: 6 digits, SHA-256-hashed at rest, 10-minute TTL, max 5 wrong attempts before the code is dead.
- Sessions: `pending_passkey` scope TTL 15 minutes; `full` scope TTL `SESSION_TTL_DAYS` (default 30), sliding — renewed when less than half the TTL remains.
- Session cookie name `sid`: `httpOnly: true`, `sameSite: 'lax'`, `secure` gated by `COOKIE_SECURE` env (`false` default), `path: '/'`.
- Throttle: `POST /auth/register` and `POST /auth/recover` limited to 5 requests/hour per `${ip}:${email}` key, in-memory (no Redis).
- Passkey deletion (`DELETE /auth/passkeys/:id`) returns 409 `LAST_PASSKEY` when the user has only one credential left.
- Env vars (server): `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`, `ADMIN_EMAIL`, `WEBAUTHN_RP_ID` (default `localhost`), `WEBAUTHN_ORIGIN` (default `http://localhost:5173`), `WEBAUTHN_RP_NAME` (default `Scriptorium`), `COOKIE_SECURE` (default `false`), `SESSION_TTL_DAYS` (default `30`).
- All `/api/*` routes require a `full` session except `/api/health` and `/api/auth/*`.
- All new Mongoose models follow existing conventions: string `_id`, `{ toJSON: idTransform, versionKey: false }` for anything exposed via the API; internal-only collections (`OtpCode`, `WebauthnChallenge`, `AuthSession`) skip `idTransform`.

---

### Task 1: Dependencies, env scaffolding, and server bootstrap wiring

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json`
- Create: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `server/src/server.js`

**Interfaces:**
- Produces: `process.env.MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`, `ADMIN_EMAIL`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME`, `COOKIE_SECURE`, `SESSION_TTL_DAYS` available to every later task; `req.cookies` available on every request (via `cookie-parser`).

- [ ] **Step 1: Add server dependencies**

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e npm install @simplewebauthn/server mailgun.js form-data cookie-parser
```

- [ ] **Step 2: Add client dependency**

```bash
cd /home/meor/workspace/scriptorium/client && wsl -d ubuntu -e npm install @simplewebauthn/browser
```

- [ ] **Step 3: Create `.env.example` at the repo root**

```
MONGODB_URI=mongodb://localhost:27017/scriptorium
MAILGUN_API_KEY=your-key-here
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5173
WEBAUTHN_RP_NAME=Scriptorium
COOKIE_SECURE=false
SESSION_TTL_DAYS=30
```

- [ ] **Step 4: Add the same variables to the `server` service in `docker-compose.yml`**

Find the `server:` service `environment:` block (currently `PORT`, `NODE_ENV`, `MONGODB_URI`) and add:

```yaml
      - MAILGUN_API_KEY=${MAILGUN_API_KEY}
      - MAILGUN_DOMAIN=${MAILGUN_DOMAIN}
      - MAILGUN_FROM_EMAIL=${MAILGUN_FROM_EMAIL}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID:-localhost}
      - WEBAUTHN_ORIGIN=${WEBAUTHN_ORIGIN:-http://localhost:5173}
      - WEBAUTHN_RP_NAME=${WEBAUTHN_RP_NAME:-Scriptorium}
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      - SESSION_TTL_DAYS=${SESSION_TTL_DAYS:-30}
```

- [ ] **Step 5: Wire `dotenv` and `cookie-parser` into `server.js`**

Add as the very first line of `server/src/server.js` (before any other import, so env vars are set before other modules read `process.env` at import time):

```js
import 'dotenv/config';
```

Then add near the other imports:

```js
import cookieParser from 'cookie-parser';
```

And after `app.use(cors());`:

```js
app.use(cookieParser());
```

- [ ] **Step 6: Verify the server still boots**

```bash
cd /home/meor/workspace/scriptorium && wsl -d ubuntu -e docker-compose up --build server mongo
```
Expected: `Connected to MongoDB` then `Scriptorium backend listening on http://localhost:3001` with no errors. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json client/package.json client/package-lock.json .env.example docker-compose.yml server/src/server.js
git commit -m "chore: add auth dependencies and env scaffolding"
```

---

### Task 2: Auth data models

**Files:**
- Create: `server/src/models/User.js`
- Create: `server/src/models/OtpCode.js`
- Create: `server/src/models/Credential.js`
- Create: `server/src/models/WebauthnChallenge.js`
- Create: `server/src/models/AuthSession.js`
- Create: `server/src/models/AuditLog.js`

**Interfaces:**
- Consumes: `idTransform` from `server/src/models/idTransform.js` (existing).
- Produces: Mongoose models `User`, `OtpCode`, `Credential`, `WebauthnChallenge`, `AuthSession`, `AuditLog`, each the default export of its file — consumed by every service task below.

- [ ] **Step 1: Create `server/src/models/User.js`**

```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const userSchema = new mongoose.Schema(
  {
    _id: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    createdAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('User', userSchema);
```

- [ ] **Step 2: Create `server/src/models/OtpCode.js`**

```js
import mongoose from 'mongoose';

const otpCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, required: true, enum: ['register', 'recovery'] },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { versionKey: false }
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

export default mongoose.model('OtpCode', otpCodeSchema);
```

- [ ] **Step 3: Create `server/src/models/Credential.js`**

```js
import mongoose from 'mongoose';
import { idTransform } from './idTransform.js';

const credentialSchema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: { type: String, required: true, index: true },
    credentialId: { type: String, required: true, unique: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, default: 0 },
    deviceLabel: { type: String, required: true },
    createdAt: { type: String },
  },
  { toJSON: idTransform, versionKey: false }
);

export default mongoose.model('Credential', credentialSchema);
```

- [ ] **Step 4: Create `server/src/models/WebauthnChallenge.js`**

```js
import mongoose from 'mongoose';

const webauthnChallengeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ['registration', 'authentication'] },
    challenge: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

webauthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('WebauthnChallenge', webauthnChallengeSchema);
```

- [ ] **Step 5: Create `server/src/models/AuthSession.js`**

Named `AuthSession` (not `Session`) to avoid colliding with the existing writing-session model at `server/src/models/Session.js`.

```js
import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    scope: { type: String, required: true, enum: ['pending_passkey', 'full'] },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuthSession', authSessionSchema);
```

- [ ] **Step 6: Create `server/src/models/AuditLog.js`**

```js
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

export default mongoose.model('AuditLog', auditLogSchema);
```

- [ ] **Step 7: Verify all six models load without error**

With `mongo` running (`wsl -d ubuntu -e docker-compose up -d mongo`), run:

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const models = ['User','OtpCode','Credential','WebauthnChallenge','AuthSession','AuditLog'];
  for (const m of models) {
    const mod = await import(\`./src/models/\${m}.js\`);
    console.log(m, '->', mod.default.modelName);
  }
  process.exit(0);
});
"
```
Expected: six lines, each `<Name> -> <Name>`, no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/User.js server/src/models/OtpCode.js server/src/models/Credential.js server/src/models/WebauthnChallenge.js server/src/models/AuthSession.js server/src/models/AuditLog.js
git commit -m "feat(server): add auth data models"
```

---

### Task 3: `otpService` and `auditService`

**Files:**
- Create: `server/src/services/otpService.js`
- Create: `server/src/services/auditService.js`

**Interfaces:**
- Consumes: `OtpCode` model (Task 2), `AuditLog` model (Task 2).
- Produces: `otpService.issue(email, purpose): Promise<string>` (returns the plaintext 6-digit code), `otpService.verify(email, purpose, code): Promise<boolean>`, `auditService.log({ userId, action, metadata }): Promise<void>` — consumed by `authService` (Task 7) and `routes/auth.js` (Task 9).

- [ ] **Step 1: Create `server/src/services/otpService.js`**

```js
import { randomInt, createHash } from 'crypto';
import OtpCode from '../models/OtpCode.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hash(code) {
  return createHash('sha256').update(code).digest('hex');
}

export async function issue(email, purpose) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const normalized = email.toLowerCase();
  const filter = { email: normalized, purpose };
  const update = {
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    consumedAt: null,
    attempts: 0,
  };
  try {
    await OtpCode.findOneAndUpdate(filter, update, { upsert: true });
  } catch (err) {
    if (err.code === 11000) {
      await OtpCode.findOneAndUpdate(filter, update);
    } else {
      throw err;
    }
  }
  return code;
}

export async function verify(email, purpose, code) {
  const normalized = email.toLowerCase();
  const doc = await OtpCode.findOne({ email: normalized, purpose });
  if (!doc || doc.consumedAt || doc.expiresAt < new Date() || doc.attempts >= MAX_ATTEMPTS) {
    return false;
  }
  if (doc.codeHash !== hash(code)) {
    await OtpCode.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    return false;
  }
  await OtpCode.updateOne({ _id: doc._id }, { consumedAt: new Date() });
  return true;
}
```

- [ ] **Step 2: Create `server/src/services/auditService.js`**

```js
import AuditLog from '../models/AuditLog.js';

export async function log({ userId, action, metadata = {} }) {
  await AuditLog.create({
    userId,
    action,
    metadata,
    createdAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 3: Verify `otpService` end-to-end against the running dev Mongo**

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const otp = await import('./src/services/otpService.js');
  const code = await otp.issue('test@example.com', 'register');
  console.log('issued', code, 'len', code.length);
  console.log('wrong code ->', await otp.verify('test@example.com', 'register', '000000'));
  console.log('right code ->', await otp.verify('test@example.com', 'register', code));
  console.log('reused code ->', await otp.verify('test@example.com', 'register', code));
  process.exit(0);
});
"
```
Expected: `issued XXXXXX len 6`, `wrong code -> false`, `right code -> true`, `reused code -> false` (already consumed).

- [ ] **Step 4: Commit**

```bash
git add server/src/services/otpService.js server/src/services/auditService.js
git commit -m "feat(server): add OTP and audit log services"
```

---

### Task 4: `emailService` (Mailgun)

**Files:**
- Create: `server/src/services/emailService.js`

**Interfaces:**
- Produces: `sendOtpEmail(to, code): Promise<void>`, `sendRegistrationRequestEmail(adminEmail, code, { name, email }): Promise<void>` — consumed by `authService` (Task 7).

- [ ] **Step 1: Create `server/src/services/emailService.js`**

Reads Mailgun config lazily (only when an email is actually sent) so the server can boot before Mailgun credentials are configured.

```js
import FormData from 'form-data';
import Mailgun from 'mailgun.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function client() {
  const mailgun = new Mailgun(FormData);
  return {
    mailer: mailgun.client({ username: 'api', key: requireEnv('MAILGUN_API_KEY') }),
    domain: requireEnv('MAILGUN_DOMAIN'),
    from: requireEnv('MAILGUN_FROM_EMAIL'),
  };
}

export async function sendOtpEmail(to, code) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] OTP for ${to}: ${code}`);
  }
  const { mailer, domain, from } = client();
  await mailer.messages.create(domain, {
    from: `Scriptorium <${from}>`,
    to: [to],
    subject: 'Your Scriptorium verification code',
    text: `Your verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
  });
}

export async function sendRegistrationRequestEmail(adminEmail, code, registrant) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] Registration request from ${registrant.name} <${registrant.email}>, code: ${code}`);
  }
  const { mailer, domain, from } = client();
  await mailer.messages.create(domain, {
    from: `Scriptorium <${from}>`,
    to: [adminEmail],
    subject: 'Scriptorium registration request',
    text: `${registrant.name} <${registrant.email}> is requesting to register.\n\nVerification code: ${code}\n\nIt expires in 10 minutes. Share it with them only if you want to approve this registration.`,
  });
}
```

- [ ] **Step 2: Verify the dev console-log path works without real Mailgun credentials**

This will throw on the actual Mailgun send (no credentials configured yet) — that's expected; confirm the `[dev]` line prints before the throw:

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('./src/services/emailService.js').then(async (email) => {
  try {
    await email.sendOtpEmail('test@example.com', '123456');
  } catch (err) {
    console.log('expected failure:', err.message);
  }
});
"
```
Expected: `[dev] OTP for test@example.com: 123456` then `expected failure: Missing required env var: MAILGUN_API_KEY`.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/emailService.js
git commit -m "feat(server): add Mailgun email service for OTP delivery"
```

---

### Task 5: `authSessionService` and cookie helpers

**Files:**
- Create: `server/src/services/authSessionService.js`
- Create: `server/src/utils/authCookie.js`

**Interfaces:**
- Consumes: `AuthSession` model (Task 2).
- Produces: `create(userId, scope): Promise<string>` (returns the raw token), `validate(token): Promise<{sessionId, userId, scope, renewed} | null>`, `upgrade(sessionId): Promise<void>`, `destroy(token): Promise<void>`, `pendingTtlMs(): number`, `fullTtlMs(): number`; `setSessionCookie(res, token, scope): void`, `clearSessionCookie(res): void` — consumed by `middleware/requireAuth.js` (Task 8) and `routes/auth.js` (Task 9).

- [ ] **Step 1: Create `server/src/services/authSessionService.js`**

```js
import { randomBytes, createHash } from 'crypto';
import AuthSession from '../models/AuthSession.js';

const PENDING_TTL_MS = 15 * 60 * 1000;

function getFullTtlMs() {
  const days = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
  return days * 24 * 60 * 60 * 1000;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function create(userId, scope) {
  const token = randomBytes(32).toString('base64url');
  const ttl = scope === 'full' ? getFullTtlMs() : PENDING_TTL_MS;
  await AuthSession.create({
    tokenHash: hashToken(token),
    userId,
    scope,
    expiresAt: new Date(Date.now() + ttl),
  });
  return token;
}

export async function validate(token) {
  const session = await AuthSession.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  let renewed = false;
  if (session.scope === 'full') {
    const fullTtlMs = getFullTtlMs();
    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs < fullTtlMs / 2) {
      await AuthSession.updateOne({ _id: session._id }, { expiresAt: new Date(Date.now() + fullTtlMs) });
      renewed = true;
    }
  }

  return {
    sessionId: session._id.toString(),
    userId: session.userId,
    scope: session.scope,
    renewed,
  };
}

export async function upgrade(sessionId) {
  await AuthSession.updateOne(
    { _id: sessionId },
    { scope: 'full', expiresAt: new Date(Date.now() + getFullTtlMs()) }
  );
}

export async function destroy(token) {
  await AuthSession.deleteOne({ tokenHash: hashToken(token) });
}

export function pendingTtlMs() {
  return PENDING_TTL_MS;
}

export function fullTtlMs() {
  return getFullTtlMs();
}
```

- [ ] **Step 2: Create `server/src/utils/authCookie.js`**

```js
import { fullTtlMs, pendingTtlMs } from '../services/authSessionService.js';

export function setSessionCookie(res, token, scope) {
  const maxAge = scope === 'full' ? fullTtlMs() : pendingTtlMs();
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie('sid', { path: '/' });
}
```

- [ ] **Step 3: Verify session create/validate/upgrade/destroy round-trip**

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const s = await import('./src/services/authSessionService.js');
  const token = await s.create('user_test1', 'pending_passkey');
  console.log('validate pending ->', await s.validate(token));
  const v = await s.validate(token);
  await s.upgrade(v.sessionId);
  console.log('validate after upgrade ->', await s.validate(token));
  await s.destroy(token);
  console.log('validate after destroy ->', await s.validate(token));
  process.exit(0);
});
"
```
Expected: first validate shows `scope: 'pending_passkey'`, second shows `scope: 'full'`, third is `null`.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/authSessionService.js server/src/utils/authCookie.js
git commit -m "feat(server): add session service and cookie helpers"
```

---

### Task 6: `webauthnService`

**Files:**
- Create: `server/src/services/webauthnService.js`

**Interfaces:**
- Consumes: `Credential`, `WebauthnChallenge`, `User` models (Task 2); `httpError` from `server/src/middleware/errorHandler.js` (existing).
- Produces: `registrationOptions(userId, email)`, `verifyRegistration(userId, response, deviceLabel)`, `authenticationOptions(email): { challengeId, options }`, `verifyAuthentication(challengeId, response): Promise<string>` (returns userId), `listCredentials(userId): Promise<{id, deviceLabel, createdAt}[]>`, `deleteCredential(userId, credentialDocId): Promise<void>` — consumed by `routes/auth.js` (Task 9).

- [ ] **Step 1: Create `server/src/services/webauthnService.js`**

```js
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import Credential from '../models/Credential.js';
import WebauthnChallenge from '../models/WebauthnChallenge.js';
import User from '../models/User.js';
import { httpError } from '../middleware/errorHandler.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

function rpId() {
  return process.env.WEBAUTHN_RP_ID || 'localhost';
}
function rpName() {
  return process.env.WEBAUTHN_RP_NAME || 'Scriptorium';
}
function origin() {
  return process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
}

export async function registrationOptions(userId, email) {
  const creds = await Credential.find({ userId });
  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpId(),
    userName: email,
    attestationType: 'none',
    excludeCredentials: creds.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await WebauthnChallenge.findOneAndUpdate(
    { userId, type: 'registration' },
    { challenge: options.challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    { upsert: true }
  );
  return options;
}

export async function verifyRegistration(userId, response, deviceLabel) {
  const challengeDoc = await WebauthnChallenge.findOne({
    userId,
    type: 'registration',
    expiresAt: { $gt: new Date() },
  });
  if (!challengeDoc) throw httpError(400, 'NO_CHALLENGE', 'No pending passkey challenge.');

  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: origin(),
    expectedRPID: rpId(),
  });
  if (!result.verified || !result.registrationInfo) {
    throw httpError(401, 'VERIFICATION_FAILED', 'Passkey verification failed.');
  }

  const { credential } = result.registrationInfo;
  const created = await Credential.create({
    _id: `cred_${shortId()}`,
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    deviceLabel,
    createdAt: new Date().toISOString(),
  });
  await challengeDoc.deleteOne();
  return created;
}

export async function authenticationOptions(email) {
  const user = await User.findOne({ email: email.toLowerCase(), emailVerified: true });
  if (!user) throw httpError(404, 'NOT_FOUND', 'No account for this email.');

  const creds = await Credential.find({ userId: user._id });
  if (creds.length === 0) {
    throw httpError(404, 'NO_PASSKEYS', 'No passkeys registered. Use account recovery.');
  }

  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({ id: c.credentialId })),
  });
  const doc = await WebauthnChallenge.create({
    challenge: options.challenge,
    userId: user._id,
    type: 'authentication',
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return { challengeId: doc._id.toString(), options };
}

export async function verifyAuthentication(challengeId, response) {
  let challengeDoc;
  try {
    challengeDoc = await WebauthnChallenge.findOne({
      _id: challengeId,
      type: 'authentication',
      expiresAt: { $gt: new Date() },
    });
  } catch {
    challengeDoc = null;
  }
  if (!challengeDoc) throw httpError(401, 'CHALLENGE_EXPIRED', 'Login challenge expired.');

  const cred = await Credential.findOne({ credentialId: response.id, userId: challengeDoc.userId });
  if (!cred) throw httpError(401, 'UNKNOWN_PASSKEY', 'Unknown passkey.');

  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: origin(),
    expectedRPID: rpId(),
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
    },
  });
  if (!result.verified) throw httpError(401, 'VERIFICATION_FAILED', 'Passkey verification failed.');

  cred.counter = result.authenticationInfo.newCounter;
  await cred.save();
  await challengeDoc.deleteOne();
  return challengeDoc.userId;
}

export async function listCredentials(userId) {
  const creds = await Credential.find({ userId }).sort({ createdAt: 1 });
  return creds.map((c) => ({ id: c._id, deviceLabel: c.deviceLabel, createdAt: c.createdAt }));
}

export async function deleteCredential(userId, credentialDocId) {
  const count = await Credential.countDocuments({ userId });
  const cred = await Credential.findOne({ _id: credentialDocId, userId });
  if (!cred) throw httpError(404, 'NOT_FOUND', 'Passkey not found.');
  if (count <= 1) throw httpError(409, 'LAST_PASSKEY', 'Cannot remove your last passkey.');
  await cred.deleteOne();
}
```

- [ ] **Step 2: Verify `listCredentials`/`deleteCredential` last-passkey guard**

The WebAuthn ceremony itself needs a real browser, so full registration/authentication is verified end-to-end in Task 16. Here, verify just the list/delete guard logic against fixture data:

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const Credential = (await import('./src/models/Credential.js')).default;
  const wa = await import('./src/services/webauthnService.js');
  await Credential.deleteMany({ userId: 'user_wtest' });
  await Credential.create({ _id: 'cred_a', userId: 'user_wtest', credentialId: 'cid_a', publicKey: Buffer.from('x'), counter: 0, deviceLabel: 'A', createdAt: new Date().toISOString() });
  console.log('list (1 cred) ->', await wa.listCredentials('user_wtest'));
  try {
    await wa.deleteCredential('user_wtest', 'cred_a');
    console.log('FAIL: should have thrown');
  } catch (err) {
    console.log('delete last passkey ->', err.status, err.code);
  }
  await Credential.create({ _id: 'cred_b', userId: 'user_wtest', credentialId: 'cid_b', publicKey: Buffer.from('y'), counter: 0, deviceLabel: 'B', createdAt: new Date().toISOString() });
  await wa.deleteCredential('user_wtest', 'cred_a');
  console.log('list after deleting one of two ->', await wa.listCredentials('user_wtest'));
  await Credential.deleteMany({ userId: 'user_wtest' });
  process.exit(0);
});
"
```
Expected: list shows 1 credential, delete-last throws `409 LAST_PASSKEY`, after adding a second credential the delete succeeds and the final list shows only `cred_b`.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/webauthnService.js
git commit -m "feat(server): add WebAuthn passkey service"
```

---

### Task 7: `authService`

**Files:**
- Create: `server/src/services/authService.js`

**Interfaces:**
- Consumes: `User` model (Task 2); `otpService`, `emailService`, `authSessionService`, `auditService` (Tasks 3-5); `httpError`.
- Produces: `startRegistration(name, email): Promise<void>`, `startRecovery(email): Promise<void>`, `verifyOtp(email, code, purpose): Promise<string>` (returns a `pending_passkey` session token) — consumed by `routes/auth.js` (Task 9).

- [ ] **Step 1: Create `server/src/services/authService.js`**

```js
import User from '../models/User.js';
import * as otpService from './otpService.js';
import * as emailService from './emailService.js';
import * as authSessionService from './authSessionService.js';
import * as auditService from './auditService.js';
import { httpError } from '../middleware/errorHandler.js';

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

export async function startRegistration(name, email) {
  const normalized = email.toLowerCase();
  const existing = await User.findOne({ email: normalized });
  if (existing?.emailVerified) {
    throw httpError(409, 'ALREADY_EXISTS', 'Account already exists. Log in instead.');
  }

  const user =
    existing ||
    (await User.create({
      _id: `user_${shortId()}`,
      email: normalized,
      name,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    }));
  if (existing && existing.name !== name) {
    existing.name = name;
    await existing.save();
  }

  const code = await otpService.issue(normalized, 'register');
  await emailService.sendRegistrationRequestEmail(process.env.ADMIN_EMAIL, code, { name, email: normalized });
  await auditService.log({ userId: user._id, action: 'auth.otp_requested', metadata: { purpose: 'register', name } });
}

export async function startRecovery(email) {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized, emailVerified: true });
  if (!user) throw httpError(404, 'NOT_FOUND', 'No account for this email.');

  const code = await otpService.issue(normalized, 'recovery');
  await emailService.sendOtpEmail(normalized, code);
  await auditService.log({ userId: user._id, action: 'auth.recovery_started' });
}

export async function verifyOtp(email, code, purpose) {
  const normalized = email.toLowerCase();
  const ok = await otpService.verify(normalized, purpose, code);
  if (!ok) throw httpError(401, 'INVALID_CODE', 'Invalid or expired code.');

  const user = await User.findOne({ email: normalized });
  if (!user) throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');

  if (purpose === 'register' && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
    await auditService.log({ userId: user._id, action: 'auth.registered' });
  }
  if (purpose === 'recovery' && !user.emailVerified) {
    throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  return authSessionService.create(user._id, 'pending_passkey');
}
```

- [ ] **Step 2: Verify the registration → verify-otp flow**

This will fail at the email-send step without real Mailgun credentials, exactly like Task 4 — confirm the OTP is issued and printed before that expected failure, then verify manually with a code pulled straight from the DB (bypassing email) to confirm `verifyOtp` works:

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const User = (await import('./src/models/User.js')).default;
  const OtpCode = (await import('./src/models/OtpCode.js')).default;
  await User.deleteOne({ email: 'flowtest@example.com' });
  const otp = await import('./src/services/otpService.js');
  const auth = await import('./src/services/authService.js');
  // issue directly (skips the email send, which needs real Mailgun creds)
  const code = await otp.issue('flowtest@example.com', 'register');
  await User.create({ _id: 'user_flowtest', email: 'flowtest@example.com', name: 'Flow Test', emailVerified: false, createdAt: new Date().toISOString() });
  const token = await auth.verifyOtp('flowtest@example.com', code, 'register');
  console.log('session token issued, length:', token.length);
  const user = await User.findOne({ email: 'flowtest@example.com' });
  console.log('emailVerified ->', user.emailVerified);
  process.exit(0);
});
"
```
Expected: `session token issued, length: 43`, `emailVerified -> true`.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/authService.js
git commit -m "feat(server): add auth orchestration service"
```

---

### Task 8: `requireAuth` and `emailThrottle` middleware

**Files:**
- Create: `server/src/middleware/requireAuth.js`
- Create: `server/src/middleware/emailThrottle.js`

**Interfaces:**
- Consumes: `authSessionService` (Task 5), `User` model (Task 2), `setSessionCookie` (Task 5), `httpError`.
- Produces: `requireAuth({ allowPending }?): (req, res, next) => void` — attaches `req.user = { id, email, scope, sessionId }`; `emailThrottle(req, res, next)` — consumed by `routes/auth.js` (Task 9), `server.js` (Task 9), and every existing router (Tasks 10-12).

- [ ] **Step 1: Create `server/src/middleware/requireAuth.js`**

```js
import * as authSessionService from '../services/authSessionService.js';
import User from '../models/User.js';
import { httpError } from './errorHandler.js';
import { setSessionCookie } from '../utils/authCookie.js';

export function requireAuth({ allowPending = false } = {}) {
  return async function (req, res, next) {
    try {
      const token = req.cookies?.sid;
      if (!token) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      const session = await authSessionService.validate(token);
      if (!session) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      if (session.scope !== 'full' && !allowPending) {
        return next(httpError(401, 'PASSKEY_SETUP_INCOMPLETE', 'Passkey setup incomplete'));
      }

      const user = await User.findById(session.userId);
      if (!user) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      if (session.renewed) {
        setSessionCookie(res, token, 'full');
      }

      req.user = { id: user._id, email: user.email, scope: session.scope, sessionId: session.sessionId };
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 2: Create `server/src/middleware/emailThrottle.js`**

In-memory sliding window, keyed by `${ip}:${email}`, 5 requests/hour — matches finance-tracker's in-memory `@nestjs/throttler` default (no Redis).

```js
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const hits = new Map();

export function emailThrottle(req, res, next) {
  const email = (req.body?.email || 'unknown').toLowerCase();
  const key = `${req.ip}:${email}`;
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= LIMIT) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    res.set('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  next();
}
```

- [ ] **Step 3: Verify `emailThrottle` blocks the 6th request**

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('./src/middleware/emailThrottle.js').then(({ emailThrottle }) => {
  const req = { body: { email: 'x@example.com' }, ip: '1.2.3.4' };
  let blocked = 0, allowed = 0;
  const res = { set() {}, status() { return this; }, json() { blocked++; } };
  for (let i = 0; i < 6; i++) {
    emailThrottle(req, res, () => { allowed++; });
  }
  console.log('allowed', allowed, 'blocked', blocked);
});
"
```
Expected: `allowed 5 blocked 1`.

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/requireAuth.js server/src/middleware/emailThrottle.js
git commit -m "feat(server): add auth and throttle middleware"
```

---

### Task 9: `routes/auth.js` and server wiring

**Files:**
- Create: `server/src/routes/auth.js`
- Modify: `server/src/server.js`

**Interfaces:**
- Consumes: everything from Tasks 3-8.
- Produces: `POST /api/auth/register`, `/recover`, `/verify-otp`, `/passkey/options`, `/passkey/verify`, `/login/options`, `/login/verify`, `/logout`, `GET /api/auth/me`, `/passkeys`, `DELETE /api/auth/passkeys/:credentialId`. All other `/api/*` routers gain `requireAuth()` in `server.js`.

- [ ] **Step 1: Create `server/src/routes/auth.js`**

```js
import { Router } from 'express';
import * as authService from '../services/authService.js';
import * as webauthnService from '../services/webauthnService.js';
import * as authSessionService from '../services/authSessionService.js';
import * as auditService from '../services/auditService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { emailThrottle } from '../middleware/emailThrottle.js';
import { httpError } from '../middleware/errorHandler.js';
import { setSessionCookie, clearSessionCookie } from '../utils/authCookie.js';

const router = Router();

router.post('/register', emailThrottle, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return next(httpError(400, 'MISSING_FIELD', 'name and email are required'));
    await authService.startRegistration(name, email);
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/recover', emailThrottle, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(httpError(400, 'MISSING_FIELD', 'email is required'));
    await authService.startRecovery(email);
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, code, purpose } = req.body;
    if (!email || !code || !purpose) {
      return next(httpError(400, 'MISSING_FIELD', 'email, code, and purpose are required'));
    }
    const token = await authService.verifyOtp(email, code, purpose);
    setSessionCookie(res, token, 'pending_passkey');
    res.json({ scope: 'pending_passkey' });
  } catch (err) {
    next(err);
  }
});

router.post('/passkey/options', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    const options = await webauthnService.registrationOptions(req.user.id, req.user.email);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/passkey/verify', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    const { response, deviceLabel } = req.body;
    const cred = await webauthnService.verifyRegistration(req.user.id, response, deviceLabel || 'Passkey');
    if (req.user.scope === 'pending_passkey') {
      await authSessionService.upgrade(req.user.sessionId);
      setSessionCookie(res, req.cookies.sid, 'full');
    }
    await auditService.log({ userId: req.user.id, action: 'passkey.added', metadata: { deviceLabel: cred.deviceLabel } });
    res.status(201).json({ id: cred._id, deviceLabel: cred.deviceLabel, createdAt: cred.createdAt });
  } catch (err) {
    next(err);
  }
});

router.post('/login/options', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(httpError(400, 'MISSING_FIELD', 'email is required'));
    res.json(await webauthnService.authenticationOptions(email));
  } catch (err) {
    next(err);
  }
});

router.post('/login/verify', async (req, res, next) => {
  try {
    const { challengeId, response } = req.body;
    if (!challengeId || !response) {
      return next(httpError(400, 'MISSING_FIELD', 'challengeId and response are required'));
    }
    const userId = await webauthnService.verifyAuthentication(challengeId, response);
    const token = await authSessionService.create(userId, 'full');
    setSessionCookie(res, token, 'full');
    await auditService.log({ userId, action: 'auth.login' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    await authSessionService.destroy(req.cookies.sid);
    clearSessionCookie(res);
    await auditService.log({ userId: req.user.id, action: 'auth.logout' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth({ allowPending: true }), (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, scope: req.user.scope });
});

router.get('/passkeys', requireAuth(), async (req, res, next) => {
  try {
    res.json(await webauthnService.listCredentials(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/passkeys/:credentialId', requireAuth(), async (req, res, next) => {
  try {
    await webauthnService.deleteCredential(req.user.id, req.params.credentialId);
    await auditService.log({ userId: req.user.id, action: 'passkey.removed', metadata: { credentialId: req.params.credentialId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Mount `authRouter` and gate every other `/api/*` router in `server.js`**

Replace the current routes block:

```js
app.use('/api/works', worksRouter);
app.use('/api/works/:workId/chapters', chaptersRouter);
app.use('/api/works/:workId/codex', codexRouter);
app.use('/api/works/:workId/catches', catchesRouter);
app.use('/api/works/:workId/map', mapRouter);
app.use('/api/works/:workId/sessions', sessionsRouter);
app.use('/api/works/:workId/export', exportRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);
```

with:

```js
app.use('/api/auth', authRouter);

const auth = requireAuth();
app.use('/api/works', auth, worksRouter);
app.use('/api/works/:workId/chapters', auth, chaptersRouter);
app.use('/api/works/:workId/codex', auth, codexRouter);
app.use('/api/works/:workId/catches', auth, catchesRouter);
app.use('/api/works/:workId/map', auth, mapRouter);
app.use('/api/works/:workId/sessions', auth, sessionsRouter);
app.use('/api/works/:workId/export', auth, exportRouter);
app.use('/api/ai', auth, aiRouter);
app.use('/api/settings', auth, settingsRouter);
```

Add the corresponding imports near the top of `server.js`:

```js
import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/requireAuth.js';
```

- [ ] **Step 3: Verify the registration + login options endpoints respond correctly over HTTP**

Start the stack (`wsl -d ubuntu -e docker-compose up --build`), then in another shell:

```bash
curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Test User","email":"admin@yourdomain.com"}'
```
Expected: `[dev] Registration request from Test User <admin@yourdomain.com>, code: XXXXXX` in the server logs, and the curl response is either `{"message":"Verification code sent."}` (if Mailgun creds are configured) or a 500 with a Mailgun config error (if not — expected until real credentials are set, matches Task 4's known gap).

```bash
curl -s http://localhost:3001/api/works
```
Expected: `{"error":"Not authenticated","code":"UNAUTHORIZED"}` with HTTP 401 — confirms the gate is applied.

```bash
curl -s http://localhost:3001/api/health
```
Expected: unchanged `{"status":"ok",...}` — confirms health stays public.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/auth.js server/src/server.js
git commit -m "feat(server): add auth routes and gate all API routers behind requireAuth"
```

---

### Task 10: `Work` ownership and `works.js` scoping

**Files:**
- Modify: `server/src/models/Work.js`
- Modify: `server/src/routes/works.js`

**Interfaces:**
- Produces: `Work.ownerId: String` field, consumed by `loadWork` middleware (Task 11) and every work-scoped route.

- [ ] **Step 1: Add `ownerId` to `server/src/models/Work.js`**

In the schema definition, add after `_id`:

```js
    ownerId: { type: String, required: true, index: true },
```

- [ ] **Step 2: Scope every `works.js` handler by `ownerId`**

`GET /` — filter by owner:

```js
router.get('/', async (req, res, next) => {
  try {
    const works = await Work.find({ ownerId: req.user.id }).select(INDEX_FIELDS).sort({ createdAt: -1 });
    res.json(works);
  } catch (err) {
    next(err);
  }
});
```

`POST /` — set owner on create (add `ownerId: req.user.id,` to the `Work.create` call, right after `_id: id,`):

```js
    const work = await Work.create({
      _id: id,
      ownerId: req.user.id,
      title,
```

`GET /:workId` — scope the lookup:

```js
router.get('/:workId', async (req, res, next) => {
  try {
    const work = await Work.findOne({ _id: req.params.workId, ownerId: req.user.id });
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(work);
  } catch (err) {
    next(err);
  }
});
```

`PUT /:workId` — scope the update and strip `ownerId` from the incoming body:

```js
router.put('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id;
    delete update.ownerId;

    const updated = await Work.findOneAndUpdate({ _id: workId, ownerId: req.user.id }, update, { new: true });
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
```

`DELETE /:workId` — scope the delete:

```js
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

- [ ] **Step 2: Verify ownership scoping over HTTP**

With the stack running, register two users manually (bypassing email — pull the OTP from server logs since Mailgun isn't configured yet) is more than this step needs; instead verify with a direct DB-seeded pair of `AuthSession` cookies:

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const User = (await import('./src/models/User.js')).default;
  const s = await import('./src/services/authSessionService.js');
  for (const id of ['user_ownA', 'user_ownB']) {
    await User.deleteOne({ _id: id });
    await User.create({ _id: id, email: \`\${id}@example.com\`, name: id, emailVerified: true, createdAt: new Date().toISOString() });
  }
  const tokenA = await s.create('user_ownA', 'full');
  const tokenB = await s.create('user_ownB', 'full');
  console.log('TOKEN_A=' + tokenA);
  console.log('TOKEN_B=' + tokenB);
  process.exit(0);
});
"
```

Then, using the printed tokens:

```bash
TOKEN_A=<paste>
TOKEN_B=<paste>
WORK_ID=$(curl -s -X POST http://localhost:3001/api/works -H 'Content-Type: application/json' -H "Cookie: sid=$TOKEN_A" -d '{"title":"Owned by A"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s http://localhost:3001/api/works -H "Cookie: sid=$TOKEN_A"
curl -s http://localhost:3001/api/works -H "Cookie: sid=$TOKEN_B"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/works/$WORK_ID -H "Cookie: sid=$TOKEN_B"
```
Expected: A's list contains "Owned by A"; B's list is `[]`; B's direct fetch of A's work returns `404`.

- [ ] **Step 3: Commit**

```bash
git add server/src/models/Work.js server/src/routes/works.js
git commit -m "feat(server): scope works to their owner"
```

---

### Task 11: `loadWork` middleware applied to child routers

**Files:**
- Create: `server/src/middleware/loadWork.js`
- Modify: `server/src/routes/chapters.js`
- Modify: `server/src/routes/codex.js`
- Modify: `server/src/routes/catches.js`
- Modify: `server/src/routes/map.js`
- Modify: `server/src/routes/sessions.js`
- Modify: `server/src/routes/export.js`

**Interfaces:**
- Consumes: `Work` model (Task 10).
- Produces: `req.work` (the loaded, ownership-verified `Work` document) — replaces every handler's own `Work.findById(workId)` ownership-blind lookup in the six routers above.

- [ ] **Step 1: Create `server/src/middleware/loadWork.js`**

```js
import Work from '../models/Work.js';
import { httpError } from './errorHandler.js';

export async function loadWork(req, res, next) {
  try {
    const work = await Work.findOne({ _id: req.params.workId, ownerId: req.user.id });
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    req.work = work;
    next();
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Apply `loadWork` and remove the duplicated lookups in each of the six routers**

For each of `chapters.js`, `codex.js`, `catches.js`, `map.js`, `sessions.js`, `export.js`:

1. Add the import: `import { loadWork } from '../middleware/loadWork.js';`
2. Add `router.use(loadWork);` immediately after `const router = Router({ mergeParams: true });`
3. In every handler, delete the block:
   ```js
   const work = await Work.findById(workId);
   if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
   ```
   (ownership + existence is now guaranteed by the time the handler runs).
4. Where a handler no longer references `Work` directly, remove the now-unused `import Work from '../models/Work.js';` — check each file individually: `chapters.js` and `sessions.js` still call `Work.findByIdAndUpdate(workId, ...)` elsewhere in the same file and must keep the import; `codex.js`, `catches.js`, `map.js` have no other `Work` usage and should drop it; `export.js` has no `Work` import to begin with (it only called `Work.findById` — check and remove if present after grep).

Run this to confirm the extent of the change before editing each file:

```bash
grep -n "Work.findById(workId)" /home/meor/workspace/scriptorium/server/src/routes/chapters.js /home/meor/workspace/scriptorium/server/src/routes/codex.js /home/meor/workspace/scriptorium/server/src/routes/catches.js /home/meor/workspace/scriptorium/server/src/routes/map.js /home/meor/workspace/scriptorium/server/src/routes/sessions.js /home/meor/workspace/scriptorium/server/src/routes/export.js
```

Apply the same 4-step edit to every match. `export.js` currently has no `Work.findById` call at all (it delegates straight to `exportService.exportWork(workId, ...)`) — it still needs `router.use(loadWork)` added so unauthorized exports 404 before reaching the export service.

- [ ] **Step 3: Verify a child route is now ownership-scoped**

Reusing `TOKEN_A`/`TOKEN_B`/`WORK_ID` from Task 10 Step 2 (re-run that step if the shell session was closed):

```bash
curl -s -X POST http://localhost:3001/api/works/$WORK_ID/chapters -H 'Content-Type: application/json' -H "Cookie: sid=$TOKEN_A" -d '{"title":"Ch 1"}'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/works/$WORK_ID/chapters -H "Cookie: sid=$TOKEN_B"
```
Expected: A's POST succeeds (201 with the chapter); B's GET returns `404` (work not found, since B doesn't own it).

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/loadWork.js server/src/routes/chapters.js server/src/routes/codex.js server/src/routes/catches.js server/src/routes/map.js server/src/routes/sessions.js server/src/routes/export.js
git commit -m "refactor(server): add loadWork middleware, enforce ownership on all work-scoped routes"
```

---

### Task 12: Per-user `Settings` and `llmService`/`ai.js` threading

**Files:**
- Modify: `server/src/models/Settings.js`
- Modify: `server/src/services/settingsService.js`
- Modify: `server/src/routes/settings.js`
- Modify: `server/src/services/llmService.js`
- Modify: `server/src/routes/ai.js`

**Interfaces:**
- Produces: `getSettings(userId)`, `saveSettings(userId, partial)` (breaking change from the current zero-arg signatures); `llmService.complete({ system, prompt, maxTokensOverride, userId })`.

- [ ] **Step 1: Change `Settings._id` from a fixed singleton to per-user**

In `server/src/models/Settings.js`, change:

```js
    _id: { type: String, default: 'singleton' },
```

to:

```js
    _id: { type: String },
```

- [ ] **Step 2: Thread `userId` through `settingsService.js`**

Replace the `SETTINGS_ID` constant and both exported functions:

```js
export async function getSettings(userId) {
  const stored = await Settings.findById(userId).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  return deepMerge(structuredClone(DEFAULT_SETTINGS), rest);
}

export async function saveSettings(userId, partial) {
  const current = await getSettings(userId);
  const merged = deepMerge(current, partial);
  merged.updatedAt = new Date().toISOString();
  await Settings.findByIdAndUpdate(userId, merged, { upsert: true, new: true });
  return merged;
}
```

Remove the now-unused `const SETTINGS_ID = 'singleton';` line. `maskSettings` is unchanged.

- [ ] **Step 3: Pass `req.user.id` at every call site in `settings.js`**

There are 4 call sites (`GET /`, `PUT /`, `POST /models`, `POST /test`). Update each `getSettings()` to `getSettings(req.user.id)` and `saveSettings(partial)` to `saveSettings(req.user.id, partial)`. For example, `GET /` becomes:

```js
router.get('/', async (req, res, next) => {
  try {
    res.json(maskSettings(await getSettings(req.user.id)));
  } catch (err) {
    next(err);
  }
});
```

And in `PUT /`, both occurrences (`await getSettings()` and `await saveSettings(partial)`) become `await getSettings(req.user.id)` and `await saveSettings(req.user.id, partial)`. Same pattern for `POST /models` and `POST /test`.

- [ ] **Step 4: Thread `userId` through `llmService.complete`**

In `server/src/services/llmService.js`, change the signature and call:

```js
export async function complete({ system, prompt, maxTokensOverride, userId } = {}) {
  const settings = await getSettings(userId);
```

- [ ] **Step 5: Pass `userId: req.user.id` at every `complete(...)` call site in `ai.js`**

There are 9 call sites. Each currently looks like one of:

```js
const raw = await complete({ system: SYSTEM_PROMPT, prompt });
```
```js
const raw = await complete({ system: SYSTEM_PROMPT, prompt, maxTokensOverride: 8000 });
```

Add `userId: req.user.id` to every object literal, e.g.:

```js
const raw = await complete({ system: SYSTEM_PROMPT, prompt, userId: req.user.id });
```
```js
const raw = await complete({ system: SYSTEM_PROMPT, prompt, maxTokensOverride: 8000, userId: req.user.id });
```

Run this first to get exact line numbers before editing:

```bash
grep -n "await complete(" /home/meor/workspace/scriptorium/server/src/routes/ai.js
```

- [ ] **Step 6: Verify per-user settings isolation over HTTP**

Reusing `TOKEN_A`/`TOKEN_B` from Task 10:

```bash
curl -s -X PUT http://localhost:3001/api/settings -H 'Content-Type: application/json' -H "Cookie: sid=$TOKEN_A" -d '{"providers":{"anthropic":{"apiKey":"sk-test-A","model":"claude-sonnet-4-6"}}}'
curl -s http://localhost:3001/api/settings -H "Cookie: sid=$TOKEN_A" | node -pe 'JSON.parse(require("fs").readFileSync(0)).providers.anthropic.keyPreview'
curl -s http://localhost:3001/api/settings -H "Cookie: sid=$TOKEN_B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).providers.anthropic.hasKey'
```
Expected: A's `keyPreview` shows a masked preview of `sk-test-A`; B's `hasKey` is `false` (B has no settings doc yet, gets defaults).

- [ ] **Step 7: Commit**

```bash
git add server/src/models/Settings.js server/src/services/settingsService.js server/src/routes/settings.js server/src/services/llmService.js server/src/routes/ai.js
git commit -m "feat(server): scope settings and AI completions per user"
```

---

### Task 13: Client `AuthContext`, `api.js`, and route guarding skeleton

**Files:**
- Create: `client/src/context/AuthContext.jsx`
- Create: `client/src/components/auth/RequireAuth.jsx`
- Modify: `client/src/utils/api.js`
- Modify: `client/src/main.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Produces: `useAuth(): { user, status, register, recover, verifyOtp, logout, refresh }` where `status` is `'loading' | 'authenticated' | 'pending_passkey' | 'anonymous'` — consumed by every auth page (Task 14) and `PasskeyManager` (Task 15).

- [ ] **Step 1: Add `credentials: 'include'` to `client/src/utils/api.js`**

In `apiFetch`, add `credentials: 'include'` to the `fetch` options:

```js
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
```

- [ ] **Step 2: Create `client/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      setStatus(me.scope === 'full' ? 'authenticated' : 'pending_passkey');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const register = useCallback((name, email) => api.post('/auth/register', { name, email }), []);
  const recover = useCallback((email) => api.post('/auth/recover', { email }), []);
  const verifyOtp = useCallback(
    async (email, code, purpose) => {
      await api.post('/auth/verify-otp', { email, code, purpose });
      await refresh();
    },
    [refresh]
  );
  const logout = useCallback(async () => {
    await api.post('/auth/logout', {});
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, register, recover, verifyOtp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Create `client/src/components/auth/RequireAuth.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function RequireAuth({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (status === 'pending_passkey') return <Navigate to="/passkey-setup" replace />;
  return children;
}
```

- [ ] **Step 4: Wrap the provider tree with `AuthProvider` in `client/src/main.jsx`**

```jsx
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { WorksProvider } from './context/WorksContext.jsx';
import { ActiveWorkProvider } from './context/ActiveWorkContext.jsx';
import { EditorProvider } from './context/EditorContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <WorksProvider>
        <ActiveWorkProvider>
          <EditorProvider>
            <UIProvider>
              <App />
            </UIProvider>
          </EditorProvider>
        </ActiveWorkProvider>
      </WorksProvider>
    </AuthProvider>
  </BrowserRouter>
);
```

- [ ] **Step 5: Gate the existing routes and add placeholder auth routes in `client/src/App.jsx`**

The actual page components are built in Task 14 — for this step, import them (they'll exist by the time this file is exercised in the browser) and wrap the existing route tree:

```jsx
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
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import VerifyOtp from './pages/auth/VerifyOtp.jsx';
import PasskeySetup from './pages/auth/PasskeySetup.jsx';
import RequireAuth from './components/auth/RequireAuth.jsx';
import { useUI } from './context/UIContext.jsx';

function Layout() {
  const location = useLocation();
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
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route path="/passkey-setup" element={<PasskeySetup />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
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
```

- [ ] **Step 6: Verify the app fails to compile until Task 14's pages exist (expected), then defer full verification to Task 14**

```bash
cd /home/meor/workspace/scriptorium/client && wsl -d ubuntu -e npm run build
```
Expected: a build error naming the missing `./pages/auth/*.jsx` modules — this confirms the wiring is correct and syntactically valid; it's expected to fail until Task 14 creates those files. Do not attempt to fix it here.

- [ ] **Step 7: Commit**

```bash
git add client/src/context/AuthContext.jsx client/src/components/auth/RequireAuth.jsx client/src/utils/api.js client/src/main.jsx client/src/App.jsx
git commit -m "feat(client): add auth context, route guard, and cookie-aware fetch"
```

---

### Task 14: Auth pages (Register, VerifyOtp, PasskeySetup, Login)

**Files:**
- Create: `client/src/pages/auth/Register.jsx`
- Create: `client/src/pages/auth/VerifyOtp.jsx`
- Create: `client/src/pages/auth/PasskeySetup.jsx`
- Create: `client/src/pages/auth/Login.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `useAuth()` (Task 13), `api` (existing), `startRegistration`/`startAuthentication` from `@simplewebauthn/browser` (Task 1).

- [ ] **Step 1: Create `client/src/pages/auth/Register.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(name, email);
      navigate('/verify-otp', { state: { email, purpose: 'register' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Request access</h1>
        <p>An admin will need to approve your registration and share a verification code with you.</p>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Request registration'}
        </button>
        <Link to="/login">Already have an account? Log in</Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/auth/VerifyOtp.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function VerifyOtp() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const purpose = location.state?.purpose || 'register';
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp(email, code, purpose);
      navigate('/passkey-setup', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Enter verification code</h1>
        <p>Enter the 6-digit code you were given.</p>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Verifying…' : 'Verify'}
        </button>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/auth/PasskeySetup.jsx`**

```jsx
import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function PasskeySetup() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddPasskey() {
    setSubmitting(true);
    setError(null);
    try {
      const options = await api.post('/auth/passkey/options', {});
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/auth/passkey/verify', { response, deviceLabel: navigator.platform || 'Passkey' });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Add a passkey</h1>
        <p>Register a passkey (Face ID, Touch ID, or a security key) to finish setting up your account.</p>
        {error && <div className="auth-error">{error}</div>}
        <button onClick={handleAddPasskey} disabled={submitting}>
          {submitting ? 'Waiting for device…' : 'Add passkey'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/pages/auth/Login.jsx`**

```jsx
import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { challengeId, options } = await api.post('/auth/login/options', { email });
      const response = await startAuthentication({ optionsJSON: options });
      await api.post('/auth/login/verify', { challengeId, response });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Log in</h1>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Waiting for device…' : 'Log in with passkey'}
        </button>
        <Link to="/register">Need access? Request registration</Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Add minimal auth page styles to `client/src/index.css`**

Append to the end of the file (reusing the existing dark/gold theme's CSS variables — check the top of `index.css` for the exact variable names in use, e.g. `--bg`, `--accent`, `--text`, and match them; the block below assumes `--bg-panel`, `--accent`, `--text`, `--text-dim`, `--border` exist based on the theme described in CLAUDE.md — adjust names to whatever the file actually defines):

```css
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}

.auth-card {
  width: 360px;
  max-width: 90vw;
  padding: 2rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-card h1 {
  font-family: Georgia, serif;
  color: var(--accent);
  margin: 0;
}

.auth-card label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.auth-card input {
  padding: 0.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
}

.auth-card button {
  padding: 0.6rem;
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.auth-card button:disabled {
  opacity: 0.6;
  cursor: default;
}

.auth-error {
  color: #e07070;
  font-size: 0.9rem;
}
```

- [ ] **Step 6: Verify the client builds and the full flow works in a browser**

```bash
cd /home/meor/workspace/scriptorium/client && wsl -d ubuntu -e npm run build
```
Expected: builds cleanly (no missing-module errors this time).

With the full stack running (`wsl -d ubuntu -e docker-compose up --build`), open `http://localhost:5173` in a real browser (not curl — WebAuthn requires an actual authenticator/platform passkey UI):
1. Should redirect to `/login`. Click through to `/register`, submit with your `ADMIN_EMAIL`.
2. Check server logs for the `[dev] Registration request from ... code: XXXXXX` line.
3. On `/verify-otp`, enter that code → should land on `/passkey-setup`.
4. Click "Add passkey" → complete your OS/browser's passkey prompt (Touch ID, Windows Hello, etc.) → should redirect to `/` (Shelves).
5. Click logout (if wired into the sidebar already; otherwise call `POST /api/auth/logout` via devtools) → redirected to `/login`.
6. Log in again with the same email using the passkey → lands on `/`.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/auth/Register.jsx client/src/pages/auth/VerifyOtp.jsx client/src/pages/auth/PasskeySetup.jsx client/src/pages/auth/Login.jsx client/src/index.css
git commit -m "feat(client): add registration, OTP verification, passkey setup, and login pages"
```

---

### Task 15: Passkey management page

**Files:**
- Create: `client/src/components/settings/PasskeyManager.jsx`
- Modify: `client/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `GET /api/auth/passkeys`, `POST /api/auth/passkey/options`, `POST /api/auth/passkey/verify`, `DELETE /api/auth/passkeys/:id` (Task 9); `startRegistration` from `@simplewebauthn/browser`.

- [ ] **Step 1: Create `client/src/components/settings/PasskeyManager.jsx`**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../../utils/api.js';

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    setLoading(true);
    try {
      setPasskeys(await api.get('/auth/passkeys'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const options = await api.post('/auth/passkey/options', {});
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/auth/passkey/verify', { response, deviceLabel: navigator.platform || 'Passkey' });
      await fetchPasskeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/auth/passkeys/${id}`);
      await fetchPasskeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const onlyOne = passkeys.length <= 1;

  return (
    <section className="settings-section">
      <h2>Passkeys</h2>
      {error && <div className="auth-error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="passkey-list">
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>{p.deviceLabel}</span>
              <span>{new Date(p.createdAt).toLocaleDateString()}</span>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={onlyOne || busyId === p.id}
                title={onlyOne ? "Can't remove your last passkey" : undefined}
              >
                {busyId === p.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={handleAdd} disabled={adding}>
        {adding ? 'Waiting for device…' : 'Add a passkey'}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Add minimal list styling to `client/src/index.css`**

Append:

```css
.passkey-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.passkey-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
}
```

- [ ] **Step 3: Render `PasskeyManager` in `client/src/pages/Settings.jsx`**

Add the import near the other `components/settings/*` imports:

```js
import PasskeyManager from '../components/settings/PasskeyManager.jsx';
```

Add `<PasskeyManager />` inside the page's returned JSX, as its own section alongside the existing provider/API-key/model sections (place it after the existing settings sections, before the closing wrapper tag — check the current return statement's outermost element and add it as the last child).

- [ ] **Step 4: Verify in a browser**

With the stack running and logged in (from Task 14's flow): navigate to `/settings`, confirm the Passkeys section lists the one passkey created during onboarding, its "Remove" button is disabled (title tooltip explains why), add a second passkey, confirm both are listed and removal is now enabled, remove one, confirm the list drops to one and removal is disabled again.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/settings/PasskeyManager.jsx client/src/pages/Settings.jsx client/src/index.css
git commit -m "feat(client): add passkey management page"
```

---

### Task 16: Full end-to-end verification pass

**Files:** none (verification only, per the spec's Testing plan).

- [ ] **Step 1: Configure real Mailgun credentials**

Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`, and `ADMIN_EMAIL` in a `.env` file at the repo root (gitignored — do not commit real credentials), matching `.env.example`'s keys. Restart the stack.

- [ ] **Step 2: Two-user isolation walkthrough**

1. Register with `ADMIN_EMAIL` → verify OTP arrives (dev console log or real email) → verify → add passkey → land in the app.
2. Log out, log back in with the passkey.
3. Register a second, different email → confirm the registration-request email lands in `ADMIN_EMAIL`'s inbox (not the second user's) with their code → relay the code to the second account → verify → add passkey.
4. As user A, create a work. As user B, confirm `GET /api/works` is empty and `GET /api/works/<A's id>` returns 404.

- [ ] **Step 3: Throttling**

Hit `POST /api/auth/register` 6 times rapidly with the same email/IP; confirm the 6th returns HTTP 429 with `Retry-After` set.

- [ ] **Step 4: Passkey management**

In `/settings`, add a second passkey to one account, delete the first, confirm success; attempt to delete the last remaining passkey, confirm the UI blocks it and a direct `DELETE /api/auth/passkeys/:id` call returns 409.

- [ ] **Step 5: Route gating**

Confirm `/api/health` and every `/api/auth/*` route work with no cookie; confirm every other `/api/*` route returns 401 with no cookie.

- [ ] **Step 6: Audit log spot-check**

```bash
cd /home/meor/workspace/scriptorium/server && wsl -d ubuntu -e node -e "
import('dotenv/config').then(() => import('./src/db.js')).then(async ({ connectMongo }) => {
  await connectMongo();
  const AuditLog = (await import('./src/models/AuditLog.js')).default;
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(10).lean();
  console.log(rows.map((r) => r.action));
  process.exit(0);
});
"
```
Expected: a mix of `auth.otp_requested`, `auth.registered`, `passkey.added`, `auth.login`, `auth.logout`, and (if Step 4 was run) `passkey.removed`.

- [ ] **Step 7: No commit for this task** — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and amend that task's commit message context (create a new fix commit referencing the task, per this repo's git conventions — never amend a pushed commit).
