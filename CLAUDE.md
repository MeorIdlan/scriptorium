# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Scriptorium is a solo fiction writing app — full-stack, fully local. It covers
the full writing pipeline (from first spark to exported manuscript) with
opt-in AI assistance. Five "rooms": Shelves, Main Room, Quill Panel, Map,
Codex. A global overlay (Catch) handles in-flow idea capture.

Stack: React 18 + Vite (client) · Express.js + MongoDB/Mongoose (server) ·
Provider-agnostic LLM layer (Anthropic/OpenAI) · pdfkit/nodepub/docx (export).

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

No test runner or linter is configured.

## Structure

```
scriptorium/
├── docker-compose.yml          # server (3001) + client (5173); data/ bind-mounted
├── data/                       # gitignored — JSON flat files + settings/API keys
├── server/
│   ├── Dockerfile
│   ├── package.json            # ESM; express, mongoose, @anthropic-ai/sdk, openai, pdfkit, nodepub, docx
│   └── src/
│       ├── server.js           # Express entry — connects Mongo, mounts all /api/* routers
│       ├── db.js                # Mongo connection
│       ├── models/             # Work, Chapter, Codex, Map, Catch, Session, Settings (Mongoose schemas)
│       ├── middleware/errorHandler.js
│       ├── services/           # settingsService, llmService, consistencyService, exportService, wordCountService
│       ├── services/providers/ # anthropic.js, openai.js
│       └── routes/             # works, chapters, codex, catches, map, sessions, ai, settings, export
└── client/
    ├── Dockerfile
    ├── index.html
    ├── vite.config.js          # dev server 0.0.0.0:5173, proxies /api → server:3001
    ├── package.json            # React 18, react-router-dom, Vite 5
    └── src/
        ├── main.jsx            # React root — BrowserRouter + all context providers
        ├── App.jsx             # Router setup (Routes/Route) + Layout
        ├── index.css           # Comprehensive dark theme CSS vars + components
        ├── context/            # WorksContext, ActiveWorkContext, EditorContext, UIContext
        ├── pages/              # Shelves, MainRoom, MapView, CodexView, Settings
        ├── components/         # layout/, shelves/, editor/, panel/, map/, codex/, overlays/, settings/
        ├── hooks/              # useAutosave, useCatch, useWordCount, useAI
        └── utils/              # api.js (fetch wrapper), wordCount.js
```

## Conventions

- Server and client are both ESM (`"type": "module"`).
- The client talks to the server only through `/api/*`; in Docker, Vite's
  proxy forwards `/api` to the `server` service. Add new endpoints under
  `/api` so the proxy keeps working.
- Data is stored in MongoDB, connected via `MONGODB_URI` (set per-environment
  in Docker Compose). Dev runs its own `mongo` container; production joins the
  external `shared-mongo` network under a dedicated `scriptorium` database.
- Styling is plain CSS in `client/src/index.css` (dark `#0e0e16` background,
  `#c9a96e` gold accent, Georgia serif).
- AI calls are opt-in only. Provider, API key, model, and generation params
  are configured in-app via `/settings` and stored in `data/settings/settings.json`.
