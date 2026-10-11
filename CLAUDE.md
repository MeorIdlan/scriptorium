# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Scriptorium is a fiction writing app — full-stack, multi-user (each user sees
only their own works), self-hostable. It covers
the full writing pipeline (from first spark to exported manuscript) with
opt-in AI assistance. Five "rooms": Shelves, Main Room, Quill Panel, Map,
Codex. A global overlay (Catch) handles in-flow idea capture.

Stack: React 18 + Vite (client) · Express.js + MongoDB/Mongoose (server) ·
Passkey (WebAuthn) + email OTP auth via Mailgun · Provider-agnostic LLM layer
(Anthropic/OpenAI) · pdfkit/nodepub/docx (export).

## Running the app

All Node/npm commands require the `wsl -d ubuntu` prefix on this machine.

```bash
# Everything (recommended) — starts mongo, server, client
wsl -d ubuntu -e docker-compose up --build

# Server only (from server/, needs MONGODB_URI pointed at a running Mongo)
wsl -d ubuntu -e sh -c "cd server && npm install && npm run dev"    # http://localhost:3001

# Client only (from client/)
wsl -d ubuntu -e sh -c "cd client && npm install && npm run dev"   # http://localhost:5173
```

Server env vars are listed in `.env.example` (Mongo URI, Mailgun, `ADMIN_EMAIL`,
WebAuthn RP id/origin/name, cookie + session TTL). Production uses
`docker-compose.prod.yml` behind a Cloudflare Tunnel — see `docs/deployment.md`.

No test runner or linter is configured.

## Structure

```
scriptorium/
├── docker-compose.yml          # dev: server (3001) + client (5173) + mongo
├── docker-compose.prod.yml     # prod: Dockerfile.prod images, shared-mongo + shared-edge networks
├── .env.example                # server env vars
├── docs/                       # deployment.md; superpowers/ (plans + specs)
├── ops/backup/                 # nightly mongodump + restore drill + cron entry, installed on the droplet (docs/deployment.md → Data)
├── server/
│   ├── Dockerfile, Dockerfile.prod
│   ├── package.json            # ESM; express, mongoose, @simplewebauthn/server, mailgun.js, @anthropic-ai/sdk, openai, pdfkit, nodepub, docx
│   └── src/
│       ├── server.js           # Express entry — connects Mongo, mounts all /api/* routers
│       ├── db.js               # Mongo connection
│       ├── models/             # Mongoose schemas — content: Work, Chapter, Snapshot, Milestone, Codex, Map, Catch, Session, Settings;
│       │                       #   auth: User, Credential, AuthSession, OtpCode, WebauthnChallenge, AuditLog
│       ├── middleware/         # errorHandler, requireAuth, requireAdmin, loadWork, emailThrottle
│       ├── services/           # workService, settingsService, llmService, consistencyService, exportService, wordCountService,
│       │                       #   authService, authSessionService, otpService, webauthnService, emailService, auditService, devAuthService,
│       │                       #   snapshotService, snapshotMigration, textDiff (version history), catchFields, sceneMarkers (scenes inside chapter HTML)
│       ├── services/providers/ # anthropic.js, openai.js
│       ├── utils/authCookie.js
│       └── routes/             # auth, admin, works, chapters, snapshots, milestones, codex, catches, map, sessions, ai, settings, export
└── client/
    ├── Dockerfile, Dockerfile.prod, nginx.conf   # prod serves the built bundle via nginx
    ├── index.html
    ├── vite.config.js          # dev server 0.0.0.0:5173, proxies /api → server:3001
    ├── package.json            # React 18, react-router-dom, @simplewebauthn/browser, Vite 5
    └── src/
        ├── main.jsx            # React root — BrowserRouter + all context providers
        ├── App.jsx             # Router setup — public auth routes, everything else behind RequireAuth
        ├── index.css           # Comprehensive dark theme CSS vars + components
        ├── context/            # AuthContext, WorksContext, ActiveWorkContext, EditorContext, UIContext
        ├── pages/              # Shelves, MainRoom, MapView, CodexView, Settings; auth/ (Login, Register,
        │                       #   VerifyOtp, PasskeySetup); admin/UserManagement
        ├── components/         # auth/, layout/, shelves/, editor/, panel/, map/, codex/, overlays/, settings/
        ├── hooks/              # useAutosave, useCatch, useWordCount, useAI
        └── utils/              # api.js (fetch wrapper), wordCount.js
```

## Conventions

- Server and client are both ESM (`"type": "module"`).
- The client talks to the server only through `/api/*`; in Docker, Vite's
  proxy forwards `/api` to the `server` service. Add new endpoints under
  `/api` so the proxy keeps working.
- Auth: register/recover sends an email OTP; verifying it gives a `pending_passkey`
  session that can only finish passkey setup, after which the session is
  `full`. Sessions live in an `sid` cookie. All `/api/*` routes except
  `/api/auth` and `/api/health` sit behind `requireAuth()`; `/api/admin` also
  needs `requireAdmin` (admin = the user whose email matches `ADMIN_EMAIL`).
- Data is per-user: `Work` has an `ownerId`; work-scoped routes use the
  `loadWork` middleware, which 404s unless the work belongs to `req.user`.
  New work-scoped routes should do the same.
- Dev auth bypass: with `DEV_AUTH_BYPASS=true` (the default in
  `docker-compose.yml`) and `NODE_ENV` not `production`, `requireAuth()` treats
  every request as the admin user `user_dev` / `dev@localhost`, created at
  startup by `services/devAuthService.js`. Set it to `false` to test the real
  login flow.
- All application data (works, chapters, settings, etc.) is stored in MongoDB,
  connected via `MONGODB_URI` (see docker-compose.yml for the connection
  string per environment). Dev runs its own `mongo` container; production
  joins the external `shared-mongo` network under a dedicated `scriptorium`
  database.
- Styling is plain CSS in `client/src/index.css` (dark `#0e0e16` background,
  `#c9a96e` gold accent, Georgia serif).
- AI calls are opt-in only. Provider, API key, model, and generation params
  are configured in-app via `/settings` and stored per user in the MongoDB
  `Settings` collection (document `_id` = user id).

@docs/playbook.md
@.claude/playbook.local.md
