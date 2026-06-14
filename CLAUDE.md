# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

All Node/npm commands require the `wsl -d ubuntu` prefix on this machine.

```bash
# Start everything (recommended)
wsl -d ubuntu -e docker-compose up

# Frontend dev server only (from frontend/)
wsl -d ubuntu -e sh -c "cd frontend && npm install && npm run dev"   # http://localhost:5173

# Backend dev server only (from backend/)
wsl -d ubuntu -e sh -c "cd backend && npm install && npm run dev"    # http://localhost:3001
```

No test runner or linter is configured.

## Directory structure

```
scriptorium/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── features/      # generator/, forge/, tracker/, settings/
│   │   ├── hooks/         # useSettings.js, useStories.js
│   │   ├── services/      # api.js, llmApi.js
│   │   ├── lib/           # promptBuilder.js, storyMemory.js, utils.js
│   │   ├── constants/     # generator.js, tracker.js
│   │   └── components/    # styles.js, Section.jsx, Tag.jsx, TypeCard.jsx
│   ├── index.html
│   ├── vite.config.js     # proxy /api → backend:3001, host 0.0.0.0
│   ├── package.json
│   └── Dockerfile
├── backend/           # Express.js API server
│   ├── server.js          # entry point — mounts routes, inits data/ files
│   ├── routes/
│   │   ├── settings.js    # GET/PATCH settings, POST/DELETE api-key
│   │   ├── stories.js     # CRUD stories, chapters, memories
│   │   ├── presets.js     # CRUD prompt presets
│   │   └── generate.js    # LLM proxy — non-streaming + SSE streaming
│   ├── package.json
│   └── Dockerfile
├── data/              # Persisted JSON — gitignored, created on first run
│   ├── settings.json      # provider, models, streaming flag, system prompt, API keys
│   ├── stories.json       # all stories with chapters and memories
│   └── presets.json       # saved system prompt presets
├── docker-compose.yml
├── .gitignore
└── CLAUDE.md
```

## Architecture

Full-stack local app. The **backend** owns all API keys, LLM calls, and data persistence. The **frontend** is a thin React client — no secrets, no direct provider calls, no localStorage.

### Backend (`backend/`)

Express.js server. On startup, initializes the three `data/` JSON files with defaults if they don't exist.

**API surface:**
- `GET /api/settings` — returns settings without keys; includes `claudeKeySet`/`openaiKeySet` booleans
- `PATCH /api/settings` — update non-secret fields (provider, models, streaming, system prompt)
- `POST /api/settings/api-key` — `{ provider, key }` — validates key against provider, stores it, returns available models
- `DELETE /api/settings/api-key/:provider` — clears stored key
- `GET/POST/PATCH/DELETE /api/stories` + `/api/stories/:id/chapters/:cid` + `/api/stories/:id/memories/:mid`
- `PUT /api/stories/:id/memories` — bulk replace all memories for a story
- `GET/POST/DELETE /api/presets`
- `POST /api/generate` — `{ systemPrompt, userMessage, mode }` — non-streaming, returns `{ text }`
- `POST /api/generate/stream` — same body — SSE stream, each event `data: {"text":"..."}`, ends with `data: [DONE]`

The `mode` field (`"generator"` or `"forge"`) tells the backend which model pair to use from settings.

### Frontend (`frontend/src/`)

Single-page React app (Vite + React 18). No routing library — uses `activeTab`/`activeScreen` state in `App.jsx`.

**Three main features under `src/features/`:**
- **`generator/`** — `PromptGenerator.jsx`: form for genre, style, POV, tone, setting, themes, length, protagonist, premise. Generates a writing prompt via local template assembly (`lib/promptBuilder.js`) or AI via `/api/generate`.
- **`forge/`** — `StoryForge.jsx`: takes a prompt (optionally pre-filled from the Generator) and streams a full story draft via `/api/generate/stream`. Can link to a tracked story to inject memories and chapter summaries as context. Completed drafts can be added to the Story Tracker.
- **`tracker/`** — `StoryTracker.jsx` + sub-components: list/detail view for tracking stories and chapters. Supports one-shot and serialized stories, chapter word counts, AI-generated chapter summaries, and a story bible (memories) system.

**Key shared modules:**
- `services/api.js` — single module for all backend HTTP calls. Replaces the old `storage.js` (localStorage) and the direct-fetch internals of `llmApi.js`.
- `services/llmApi.js` — thin re-export shim; `callLLM`/`callLLMStreaming` delegate to `api.js`. Kept so existing feature components don't need import changes. `hasApiKey(settings)` checks `claudeKeySet`/`openaiKeySet` booleans.
- `hooks/useSettings.js` — fetches from `/api/settings` on mount; exposes `updateSettings`, `saveApiKey`, `clearApiKey`.
- `hooks/useStories.js` — loads from `/api/stories` on mount; each mutation optimistically updates local React state and fires a background API call.
- `lib/promptBuilder.js` — pure functions: `buildPrompt` (template assembly), `buildLLMUserMessage` (structured AI input), `resolvePromptTemplate` (variable substitution). `PROMPT_VARIABLES` lists all `{token}` keys.
- `lib/storyMemory.js` — pure functions for chapter summary prompts, memory batch prompts, memory parsing (`parseMemoryEntries`), and `buildForgeAppendix` (formats story bible + summaries for Forge context).
- `constants/generator.js` — `GENRES`, `WRITING_STYLES`, `POV_OPTIONS`, `TONE_OPTIONS`, `STORY_TYPES`, `LENGTHS`, `THEMES`, `SETTINGS`.
- `components/styles.js` — shared inline style objects: `inputStyle`, `labelStyle`, `ghostBtn`.

**Settings on the client:** API keys are never sent to the browser. Settings from `/api/settings` include `claudeKeySet: bool` / `openaiKeySet: bool` instead of key values. The settings screen has write-only key inputs — the backend validates and stores them on `POST /api/settings/api-key`.

**Data flow for "Send to Forge":** `PromptGenerator` calls `onSendToForge(prompt)` → `App` sets `forgePrompt` state and switches to the forge tab → `StoryForge` receives it as `initialPrompt`, consumes it via `onPromptConsumed`.

**Styling:** all inline styles, dark theme (`#0e0e16` background, `#c9a96e` gold accent), Georgia serif font. No CSS files or utility classes.
