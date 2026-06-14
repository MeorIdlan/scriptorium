# Narrative Engine

A local full-stack writing tool — generate writing prompts, draft stories with AI, and track your projects. Runs entirely on your machine; API keys stay on the backend and never touch the browser.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Docker Compose)

That's all. No Node.js install required on the host.

## Setup

### 1. Start the app

```bash
docker-compose up
```

This builds and starts two containers:
- **backend** on port `3001` — Express.js API, stores data in `data/`
- **frontend** on port `5173` — Vite dev server (React)

Open **http://localhost:5173** in your browser.

The `data/` folder is created automatically on first run and persists between restarts.

### 2. Add an API key

Click the **⚙** settings button in the top-right corner.

Under **API Configuration**, select your provider (Claude or OpenAI), paste your key, and click **Save Key**. The backend validates the key and stores it in `data/settings.json` — it is never sent to the browser.

Once a key is saved, model selectors appear and all AI features are unlocked.

---

## Features

### Prompt Generator

Build a structured writing prompt by selecting genre, writing style, point of view, tone, setting, themes, protagonist, and core premise. Two generation modes:

- **Template mode** — no API key required; assembles a prompt locally from your selections.
- **AI mode** — sends your parameters to the LLM and receives a crafted prompt with streaming output. Supports a fully customisable system prompt with variable insertion (`{genre}`, `{themes}`, etc.) and saved presets.

Use **Send to Forge** to pass the finished prompt directly to the Story Forge.

### Story Forge

Paste or receive a writing prompt and generate a full story draft with streaming output. Before generating you can:

- Link to a tracked story to automatically inject its **story bible** (characters, plot threads, world details) and **chapter summaries** as reference context, keeping the AI consistent with your existing narrative.

Completed drafts can be saved directly to the Story Tracker as a new one-shot, a new serialised story, or an additional chapter on an existing story.

### Story Tracker

Track your writing projects in a list/detail view.

- **One-shot** and **serialised** story types
- Per-story status: Planning, Drafting, On Hiatus, Complete
- Chapter management with status (Draft, Written, Published) and word count tracking
- **AI chapter summaries** — generate a tight 120–180 word continuity summary for each chapter
- **Story bible (Memories)** — AI compiles categorised notes (Characters, Plot Threads, World, Timeline) from your chapter text in batches; manual entries supported too

---

## Data

All data lives in the `data/` folder at the project root. It is git-ignored and volume-mounted into the backend container, so it survives container restarts and rebuilds.

| File | Contents |
|------|----------|
| `data/settings.json` | Provider choice, model selections, streaming flag, custom system prompt, **API keys** |
| `data/stories.json` | All stories with chapters and memories |
| `data/presets.json` | Saved system prompt presets |

To back up your data, copy the `data/` folder. To migrate from a previous version that used browser localStorage, copy the relevant values into these JSON files manually.

---

## Supported providers & models

**Claude (Anthropic)**
- Claude Opus 4.8
- Claude Sonnet 4.6
- Claude Haiku 4.5

**OpenAI**
- GPT-4o, GPT-4o Mini, GPT-4 Turbo (and any other chat models on your account)

Separate model selections are available for the Prompt Generator and the Story Forge, so you can use a faster model for prompts and a more capable one for full story drafts.

---

## Stopping & rebuilding

```bash
# Stop containers
docker-compose down

# Rebuild after code changes
docker-compose up --build
```
