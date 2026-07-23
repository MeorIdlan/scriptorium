# Provider API Key Encryption at Rest — Design

Date: 2026-07-23

## Problem

`Settings.providers.<id>.apiKey` (server/src/models/Settings.js) is currently
stored in MongoDB as plaintext. Anyone with read access to the Mongo data
files, a `mongodump`/backup, or a disk snapshot can read every user's LLM
provider API key directly. The client already never sees the raw key back
(`maskSettings()` in settingsService.js strips it to a preview), but that's
response-shaping, not storage security.

This app is solo/small (~5 users, per user request), fully local by default
(CLAUDE.md), so the threat model is narrower than a public multi-tenant SaaS
— but plaintext secrets at rest is still worth closing off cheaply, especially
since a prod deployment (docker-compose.prod.yml) exists.

## Goals

- Encrypt `apiKey` values at rest in MongoDB using AES-256-GCM.
- Keep the encryption key outside the database, in an environment variable.
- Change nothing about the external behavior of `/api/settings/*` routes or
  the client — encryption is invisible to everything except
  `settingsService.js` and the DB contents.
- Fail loudly and early if the app is misconfigured, rather than silently
  storing or losing key material.

## Non-goals

- No migration of existing plaintext keys in the DB. Per-scope decision:
  legacy plaintext values are read back as-is (passthrough) and will be
  encrypted the next time that provider's settings are saved. No manual
  migration script, no forced re-entry.
- No key rotation tooling, no KMS/Vault integration, no per-record key
  derivation (envelope encryption). A single static env-var key is
  appropriate at this scale.
- No changes to `maskSettings()`'s masking/preview behavior — it already
  operates on plaintext and needs no changes.

## Architecture

A new module, `server/src/services/cryptoService.js`, owns all encryption
logic and env var handling. It is called only from `settingsService.js`.
Nothing else in the codebase (routes, `llmService.js`) changes — they
continue to read/write plain JS objects with plaintext `apiKey` strings in
memory, exactly as today.

```
server.js  ──(boot, before app.listen)──▶ cryptoService.assertKeyConfigured()

routes/settings.js  ─┐
llmService.js        ├──▶ settingsService.js ──▶ cryptoService.js ──▶ Settings (Mongo)
                     ─┘     (getSettings/saveSettings)  (encrypt/decrypt)
```

## `cryptoService.js` interface

```js
export function assertKeyConfigured()   // throws if SETTINGS_ENC_KEY missing/wrong length; called once at boot
export function encrypt(plaintext)      // string -> "enc:v1:<b64 iv>:<b64 authTag>:<b64 ciphertext>"
export function decrypt(stored)         // reverse of encrypt; passthrough for non-"enc:v1:" values; throws on tamper/wrong-key
export function isEncrypted(value)      // value?.startsWith('enc:v1:')
```

- Algorithm: `aes-256-gcm` via Node's built-in `crypto` module — no new
  dependency.
- Key: `SETTINGS_ENC_KEY` env var, base64-encoded, must decode to exactly 32
  bytes (AES-256). Generate with `openssl rand -base64 32`. Read from
  `process.env` per call (no caching needed at this scale); decoded once
  into a `Buffer` per call.
- IV: fresh random 12 bytes per `encrypt()` call (GCM standard nonce size),
  never reused.
- Auth tag: GCM's 16-byte tag, stored in the envelope, verified on decrypt.
- Envelope format: a single tagged string,
  `enc:v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>`. The `enc:v1:`
  prefix distinguishes encrypted values from legacy plaintext keys (which
  never start with that literal), and versions the format for any future
  algorithm change.
- `decrypt()` on a value that fails `isEncrypted()` returns it unchanged
  (legacy plaintext passthrough). `decrypt()` on a tagged value that fails
  GCM authentication (tampered/corrupted/wrong key) throws.

## `settingsService.js` integration

```js
import { encrypt, decrypt } from './cryptoService.js';

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

export async function saveSettings(userId, partial) {
  const current = await getSettings(userId);       // apiKey already decrypted
  const merged = deepMerge(current, partial);       // partial's apiKey (if any) is plaintext from the route
  delete merged._id; delete merged.id;
  merged.updatedAt = new Date().toISOString();

  const toStore = structuredClone(merged);
  for (const provider of Object.values(toStore.providers)) {
    if (provider.apiKey) provider.apiKey = encrypt(provider.apiKey);
  }
  await Settings.findByIdAndUpdate(userId, toStore, { upsert: true, new: true });

  return merged; // caller gets plaintext, same as before
}
```

`maskSettings()` and all of `routes/settings.js` (`/`, `/providers`,
`/models`, `/test`) are untouched — they already operate on the plaintext
object returned by `getSettings`/`saveSettings`.

## Boot validation & error handling

- `server.js` calls `cryptoService.assertKeyConfigured()` before
  `app.listen(...)`, alongside the existing Mongo connection step. On
  failure, log a clear message —
  `SETTINGS_ENC_KEY must be a base64-encoded 32-byte key — generate one with: openssl rand -base64 32`
  — and exit non-zero. The server never starts half-configured.
- A `decrypt()` failure during a request (wrong key after rotation,
  corrupted document) throws inside `getSettings()`. This propagates through
  the route handler's existing `try/catch` → `next(err)` → the existing
  `middleware/errorHandler.js` → a 500 response. No new error-handling
  plumbing is needed.
- `docker-compose.yml` and `docker-compose.prod.yml` need `SETTINGS_ENC_KEY`
  added to the server service's environment. The value is generated and set
  by the user/operator — never invented or committed by this change.

## Testing plan

No test runner is configured in this repo (per CLAUDE.md), so verification
is manual/scripted rather than an automated suite:

1. **Round-trip**: `encrypt('sk-test-123')` then `decrypt(...)` returns the
   original string; the intermediate form starts with `enc:v1:`.
2. **Tamper**: flip a byte in the ciphertext or authTag portion of an
   encrypted string; `decrypt()` throws.
3. **Legacy passthrough**: `decrypt()` on a plain non-prefixed string
   (simulating an existing DB row) returns it unchanged.
4. **End-to-end via the running app**: set a provider API key through
   `/settings` in the UI; confirm the stored value in Mongo
   (`db.settings.find()`) is an `enc:v1:...` envelope; confirm
   `/api/settings/test` still successfully calls the provider (proving
   decrypt works in the real flow).
5. **Boot failure**: start the server with `SETTINGS_ENC_KEY` unset or
   invalid; confirm it exits with the clear error message instead of
   starting.

## Files touched

- `server/src/services/cryptoService.js` (new)
- `server/src/services/settingsService.js` (encrypt/decrypt integration)
- `server/src/server.js` (boot-time `assertKeyConfigured()` call)
- `docker-compose.yml`, `docker-compose.prod.yml` (add `SETTINGS_ENC_KEY` to
  server env — value supplied by the user, not committed)
