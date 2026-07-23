# Provider API Key Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt `Settings.providers.<id>.apiKey` at rest in MongoDB using AES-256-GCM, keyed by an environment variable, with zero behavior change outside `settingsService.js`.

**Architecture:** A new `cryptoService.js` module wraps Node's built-in `crypto` (aes-256-gcm) behind `encrypt`/`decrypt`/`isEncrypted`/`assertKeyConfigured`. `settingsService.js` calls `decrypt` on every provider `apiKey` inside `getSettings()` and `encrypt` inside `saveSettings()`. `server.js` calls `assertKeyConfigured()` before starting the HTTP listener so a missing/malformed key fails the boot, not a request. No other file changes.

**Tech Stack:** Node.js built-in `crypto` module (no new npm dependency), Express, Mongoose. No test runner is configured in this repo — verification is via a manual Node script and manual app exercising, as spelled out in each task.

## Global Constraints

- Algorithm: `aes-256-gcm` only, via Node's built-in `crypto` module — do not add a new dependency (e.g. no `node-forge`, no `crypto-js`).
- Env var name: `SETTINGS_ENC_KEY`, base64-encoded, must decode to exactly 32 bytes. Generate with `openssl rand -base64 32`.
- Envelope string format: `enc:v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>` — exactly this prefix and colon-delimited layout.
- IV: 12 random bytes per encryption call, generated fresh every time (never reused, never derived).
- No migration of existing plaintext keys — `decrypt()` must return non-`enc:v1:`-prefixed values unchanged (passthrough), and they get encrypted automatically the next time that provider's settings are saved.
- Decrypt failures on a tagged (`enc:v1:`) value (tamper, wrong key) must throw — never silently return empty/null.
- Missing/malformed `SETTINGS_ENC_KEY` must fail server boot (before `app.listen`), not fail lazily on first request.
- Do not touch `maskSettings()`, `routes/settings.js`, or `llmService.js` — they must keep working unmodified against plaintext in-memory objects.

---

### Task 1: `cryptoService.js` — encrypt/decrypt/isEncrypted/assertKeyConfigured

**Files:**
- Create: `server/src/services/cryptoService.js`
- Test: `server/src/services/cryptoService.manual-test.mjs` (throwaway manual verification script, not part of any test runner — delete is not required but do not wire it into `npm test` since none exists)

**Interfaces:**
- Produces (used by Task 2):
  - `assertKeyConfigured(): void` — throws `Error` with message `SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32` if the env var is missing or does not decode to exactly 32 bytes.
  - `encrypt(plaintext: string): string` — returns `enc:v1:<b64 iv>:<b64 authTag>:<b64 ciphertext>`.
  - `decrypt(stored: string): string` — if `!isEncrypted(stored)`, returns `stored` unchanged; otherwise decrypts and returns plaintext, throwing on auth failure.
  - `isEncrypted(value: string): boolean` — `typeof value === 'string' && value.startsWith('enc:v1:')`.

- [ ] **Step 1: Write `cryptoService.js`**

```js
// server/src/services/cryptoService.js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function loadKey() {
  const raw = process.env.SETTINGS_ENC_KEY;
  if (!raw) {
    throw new Error(
      'SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      'SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32'
    );
  }
  return key;
}

export function assertKeyConfigured() {
  loadKey();
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plaintext) {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(stored) {
  if (!isEncrypted(stored)) return stored;

  const key = loadKey();
  const [, , ivB64, authTagB64, ciphertextB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
```

Note: the stored string is `enc:v1:iv:authTag:ciphertext` — splitting on `:` gives `['enc', 'v1', iv, authTag, ciphertext]`, hence the leading two `,` placeholders when destructuring.

- [ ] **Step 2: Write the manual verification script**

```js
// server/src/services/cryptoService.manual-test.mjs
import assert from 'assert';
import { encrypt, decrypt, isEncrypted, assertKeyConfigured } from './cryptoService.js';

assertKeyConfigured();
console.log('assertKeyConfigured: OK (key present and valid)');

// Round-trip
const original = 'sk-test-123456789';
const stored = encrypt(original);
assert(stored.startsWith('enc:v1:'), 'encrypted value should start with enc:v1:');
assert(isEncrypted(stored), 'isEncrypted should be true for encrypted value');
const roundTripped = decrypt(stored);
assert.strictEqual(roundTripped, original, 'round-trip should return original plaintext');
console.log('round-trip: OK');

// Legacy passthrough
const legacy = 'sk-plain-legacy-key';
assert.strictEqual(isEncrypted(legacy), false, 'plain key should not be flagged as encrypted');
assert.strictEqual(decrypt(legacy), legacy, 'decrypt should pass through legacy plaintext unchanged');
console.log('legacy passthrough: OK');

// Tamper detection
const parts = stored.split(':');
const tamperedCiphertext = Buffer.from(parts[4], 'base64');
tamperedCiphertext[0] ^= 0xff; // flip a byte
parts[4] = tamperedCiphertext.toString('base64');
const tampered = parts.join(':');
assert.throws(() => decrypt(tampered), 'decrypt should throw on tampered ciphertext');
console.log('tamper detection: OK');

console.log('All cryptoService checks passed.');
```

- [ ] **Step 3: Run the manual script to verify it fails first (no key set)**

Run: `wsl -d ubuntu -e sh -c "cd server && node src/services/cryptoService.manual-test.mjs"`
Expected: throws `SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32`

- [ ] **Step 4: Generate a key and re-run to verify it passes**

Run: `wsl -d ubuntu -e sh -c "cd server && SETTINGS_ENC_KEY=$(openssl rand -base64 32) node src/services/cryptoService.manual-test.mjs"`
Expected output ends with: `All cryptoService checks passed.`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/cryptoService.js server/src/services/cryptoService.manual-test.mjs
git commit -m "feat(server): add AES-256-GCM cryptoService for encrypting secrets at rest"
```

---

### Task 2: Wire encryption into `settingsService.js`

**Files:**
- Modify: `server/src/services/settingsService.js`

**Interfaces:**
- Consumes: `encrypt(plaintext: string): string`, `decrypt(stored: string): string` from `server/src/services/cryptoService.js` (Task 1).
- Produces: `getSettings(userId)` continues returning an object whose `providers.<id>.apiKey` is always plaintext; `saveSettings(userId, partial)` continues accepting plaintext `apiKey` in `partial.providers.<id>.apiKey` and returns plaintext. No signature changes — existing callers (`routes/settings.js`, any `llmService.js` usage) need no changes.

- [ ] **Step 1: Add the import and decrypt-on-read in `getSettings`**

Edit `server/src/services/settingsService.js`. Current top of file:

```js
import Settings from '../models/Settings.js';
```

Change to:

```js
import Settings from '../models/Settings.js';
import { encrypt, decrypt } from './cryptoService.js';
```

Current `getSettings`:

```js
export async function getSettings(userId) {
  const stored = await Settings.findById(userId).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  return deepMerge(structuredClone(DEFAULT_SETTINGS), rest);
}
```

Change to:

```js
export async function getSettings(userId) {
  const stored = await Settings.findById(userId).lean();
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  const { _id, __v, ...rest } = stored;
  const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), rest);

  for (const provider of Object.values(merged.providers)) {
    if (provider.apiKey) provider.apiKey = decrypt(provider.apiKey);
  }
  return merged;
}
```

- [ ] **Step 2: Add encrypt-on-write in `saveSettings`**

Current `saveSettings`:

```js
export async function saveSettings(userId, partial) {
  const current = await getSettings(userId);
  const merged = deepMerge(current, partial);
  delete merged._id;
  delete merged.id;
  merged.updatedAt = new Date().toISOString();
  await Settings.findByIdAndUpdate(userId, merged, { upsert: true, new: true });
  return merged;
}
```

Change to:

```js
export async function saveSettings(userId, partial) {
  const current = await getSettings(userId);
  const merged = deepMerge(current, partial);
  delete merged._id;
  delete merged.id;
  merged.updatedAt = new Date().toISOString();

  const toStore = structuredClone(merged);
  for (const provider of Object.values(toStore.providers)) {
    if (provider.apiKey) provider.apiKey = encrypt(provider.apiKey);
  }
  await Settings.findByIdAndUpdate(userId, toStore, { upsert: true, new: true });

  return merged;
}
```

`maskSettings()` and `deepMerge()` below this in the file are unchanged.

- [ ] **Step 3: Manually verify with a scratch script (server not required to be running)**

```js
// server/src/services/settingsService.manual-test.mjs
// Run against a real Mongo instance (e.g. the docker-compose mongo service) with SETTINGS_ENC_KEY set.
import mongoose from 'mongoose';
import assert from 'assert';
import { getSettings, saveSettings } from './settingsService.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/scriptorium');

const testUserId = 'manual-test-user-' + Date.now();

const saved = await saveSettings(testUserId, {
  providers: { anthropic: { apiKey: 'sk-manual-test-key', model: 'claude-sonnet-4-6' } },
});
assert.strictEqual(saved.providers.anthropic.apiKey, 'sk-manual-test-key', 'saveSettings should return plaintext');

const fetched = await getSettings(testUserId);
assert.strictEqual(fetched.providers.anthropic.apiKey, 'sk-manual-test-key', 'getSettings should return plaintext');

const rawDoc = await mongoose.connection.collection('settings').findOne({ _id: testUserId });
assert(rawDoc.providers.anthropic.apiKey.startsWith('enc:v1:'), 'DB doc should store the encrypted envelope');

console.log('settingsService encryption round-trip: OK');
await mongoose.connection.collection('settings').deleteOne({ _id: testUserId });
await mongoose.disconnect();
```

Run: `wsl -d ubuntu -e sh -c "cd server && SETTINGS_ENC_KEY=$(openssl rand -base64 32) MONGODB_URI=mongodb://localhost:27017/scriptorium node src/services/settingsService.manual-test.mjs"`

(Adjust `MONGODB_URI` to match whatever Mongo instance is reachable — e.g. run `docker-compose up mongo` first if nothing is running locally.)

Expected output: `settingsService encryption round-trip: OK`

- [ ] **Step 4: Delete the scratch script (it was only for manual verification, not a permanent test)**

```bash
rm server/src/services/settingsService.manual-test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add server/src/services/settingsService.js
git commit -m "feat(server): encrypt provider apiKey at rest via cryptoService"
```

---

### Task 3: Boot-time key validation in `server.js`

**Files:**
- Modify: `server/src/server.js`

**Interfaces:**
- Consumes: `assertKeyConfigured()` from `server/src/services/cryptoService.js` (Task 1).

- [ ] **Step 1: Add the import**

Current top of `server/src/server.js`:

```js
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectMongo } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';
```

Change to:

```js
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectMongo } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { assertKeyConfigured } from './services/cryptoService.js';
```

- [ ] **Step 2: Call it at the top of `start()`**

Current:

```js
async function start() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Scriptorium backend listening on http://localhost:${PORT}`);
  });
}

start();
```

Change to:

```js
async function start() {
  assertKeyConfigured();
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Scriptorium backend listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Verify boot fails without the key**

Run: `wsl -d ubuntu -e sh -c "cd server && unset SETTINGS_ENC_KEY && node src/server.js"`
Expected: process prints `SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32` and exits (non-zero), without printing the "listening on" line.

- [ ] **Step 4: Verify boot succeeds with the key**

Run: `wsl -d ubuntu -e sh -c "cd server && SETTINGS_ENC_KEY=$(openssl rand -base64 32) node src/server.js"`
Expected: prints `Scriptorium backend listening on http://localhost:3001` (requires a reachable Mongo per `MONGODB_URI`; stop the process with Ctrl+C after confirming).

- [ ] **Step 5: Commit**

```bash
git add server/src/server.js
git commit -m "feat(server): fail fast at boot if SETTINGS_ENC_KEY is missing or invalid"
```

---

### Task 4: Add `SETTINGS_ENC_KEY` to compose files and generate the real key

**Files:**
- Modify: `docker-compose.yml`
- (No change needed to `docker-compose.prod.yml` — it already loads all vars via `env_file: - .env`, so adding the key to the prod `.env` file is sufficient and is an operational step, not a code change.)

**Interfaces:** none (configuration only).

- [ ] **Step 1: Add `SETTINGS_ENC_KEY` to the dev compose file's server environment block**

Current relevant block in `docker-compose.yml`:

```yaml
  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongo:27017/scriptorium
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

Add one line, so it reads:

```yaml
  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongo:27017/scriptorium
      - MAILGUN_API_KEY=${MAILGUN_API_KEY}
      - MAILGUN_DOMAIN=${MAILGUN_DOMAIN}
      - MAILGUN_FROM_EMAIL=${MAILGUN_FROM_EMAIL}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID:-localhost}
      - WEBAUTHN_ORIGIN=${WEBAUTHN_ORIGIN:-http://localhost:5173}
      - WEBAUTHN_RP_NAME=${WEBAUTHN_RP_NAME:-Scriptorium}
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      - SESSION_TTL_DAYS=${SESSION_TTL_DAYS:-30}
      - SETTINGS_ENC_KEY=${SETTINGS_ENC_KEY}
```

- [ ] **Step 2: Generate a real key and add it to the local `.env` file (not committed)**

Run: `openssl rand -base64 32`

Add the output to the repo-root `.env` file (the same file docker-compose already reads `MAILGUN_API_KEY` etc. from) as:

```
SETTINGS_ENC_KEY=<paste generated value>
```

Confirm `.env` is git-ignored: `git check-ignore -v .env` should print a match. Do not commit this value anywhere.

- [ ] **Step 3: Verify the stack boots**

Run: `wsl -d ubuntu -e docker-compose up --build`
Expected: server logs `Scriptorium backend listening on http://localhost:3001` with no `SETTINGS_ENC_KEY` error. Stop with Ctrl+C.

- [ ] **Step 4: For production, add the same key to the prod `.env` used by `docker-compose.prod.yml`**

This is an operational step on whatever host runs `docker-compose.prod.yml` (it already does `env_file: - .env`, so no compose file edit is needed there) — generate a separate key with `openssl rand -base64 32` and add `SETTINGS_ENC_KEY=...` to that host's `.env`. Note down (outside of chat/commit history) that rotating this key without re-entering API keys in Settings will make existing encrypted keys undecryptable (by design — Section "Decrypt failure" of the spec).

- [ ] **Step 5: Commit the compose file change**

```bash
git add docker-compose.yml
git commit -m "chore: pass SETTINGS_ENC_KEY through to the server container"
```

---

### Task 5: End-to-end verification through the running app

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Start the full stack**

Run: `wsl -d ubuntu -e docker-compose up --build`

- [ ] **Step 2: Set a provider API key through the UI**

Open `http://localhost:5173`, log in, go to Settings, enter a test value (e.g. `sk-e2e-test-key`) for the Anthropic API key, and save.

- [ ] **Step 3: Confirm the stored value in Mongo is encrypted**

Run: `wsl -d ubuntu -e docker-compose exec mongo mongosh scriptorium --eval "db.settings.find().pretty()"`
Expected: the `providers.anthropic.apiKey` field starts with `enc:v1:`, not the raw value you typed.

- [ ] **Step 4: Confirm the app can still use the key**

In the Settings UI, use the "test connection" action (backed by `POST /api/settings/test`) for the Anthropic provider.
Expected: it attempts a real call using the decrypted key (it will fail with an auth error from Anthropic since `sk-e2e-test-key` isn't a real key — that's fine; the important thing is the error comes back from the *Anthropic SDK*, e.g. an auth/401-style message, not a `decrypt` error, confirming decrypt() ran successfully and produced the plaintext key that was sent).

- [ ] **Step 5: Clean up the test data**

Remove the test key via the Settings UI (clear the field and save, or delete the test settings document directly): `wsl -d ubuntu -e docker-compose exec mongo mongosh scriptorium --eval "db.settings.deleteMany({})"` only if this is a throwaway dev DB with no other data you care about — otherwise just clear the field via the UI.

No commit for this task — it's verification only.
