# MongoDB Migration Design

**Date:** 2026-07-22
**Status:** Approved

## Goal

Replace Scriptorium's JSON-flat-file storage (`server/src/services/fileService.js`
and the `data/` directory) with MongoDB via Mongoose. Add a `mongo` service to
the dev Docker Compose stack, and connect the production stack to the shared
external Mongo instance the same way `finance-tracker` does (external
`shared-mongo` network, no `mongo` service defined in scriptorium's own prod
compose file, distinct database name for isolation).

This is a from-scratch migration: no existing `data/` content needs to carry
over into Mongo (confirmed fresh start). `fileService.js` and every
`readJSON`/`writeJSON`/`ensureDir`/`deleteDir`/`exists` call site (9 files:
`works.js`, `chapters.js`, `codex.js`, `catches.js`, `map.js`, `sessions.js`,
`ai.js`, `consistencyService.js`, `exportService.js`, `wordCountService.js`,
`settingsService.js`, `server.js`) is replaced with Mongoose model calls.

## Data model

One Mongoose collection per entity, using the existing custom string IDs
(`work_xxxxx`, `ch_<ts>_xxx`, `char_xxxxx`, `catch_xxxxx`, `sess_xxxxx`,
`flag_xxxxx`) as `_id` (`type: String`) so route code and client-facing JSON
shapes barely change.

- **`works`** — one document per work (today's `meta.json`). The separate
  `works.json` index file is eliminated: `GET /api/works` becomes
  `Work.find().select(indexFields)` — a Mongo projection replaces the
  hand-maintained index-file duplication.
- **`chapters`** — one document per chapter, `workId` field for scoping.
  `chapters.json`'s index likewise disappears; `GET /works/:id/chapters`
  becomes a projected query excluding `content` and `draftHistory`.
- **`codices`** — one document per work: `{ workId, characters, places,
  worldRules }`, mirrors today's single `codex.json` blob.
- **`maps`** — one document per work: `{ workId, framework, acts, chapters,
  keyBeats, missingBeats }`, mirrors `map.json`.
- **`catches`** — one document per catch, `workId` field. The `?status=`
  filter becomes a query condition (`Catch.find({ workId, status })`)
  instead of an in-memory `.filter()`.
- **`sessions`** — one document per session, `workId` field.
- **`settings`** — a singleton document (exactly one row, upserted).

## Access-layer principles ("use Mongo fully")

Prefer Mongo-side computation and atomic operators over
read-into-JS/mutate/write-back:

- **`wordCountService.recalculate(workId)`** — an aggregation pipeline
  (`Chapter.aggregate([{ $match: { workId } }, { $group: { _id: null, total:
  { $sum: '$wordCount' } } }])`) followed by `Work.findByIdAndUpdate`. Chapter
  bodies are never pulled into Node for this.
- **Catches status filter** — a query condition, not `.filter()` over an
  in-memory array.
- **Codex character add/update** — `$push` for new characters,
  `Codex.findOneAndUpdate({ workId, 'characters.id': charId }, { $set: {...}
  } })` for updates, instead of rewriting the whole codex document.
- **`consistencyService.scan`** — the regex matching against chapter prose is
  inherently JS and stays that way (Mongo can't do fuzzy title/alias
  matching), but it still needs the codex's characters loaded to run the
  regex. The resulting flag write becomes a targeted `$push` onto the
  matched character subdocument (`Codex.updateOne({ workId, 'characters.id':
  id }, { $push: { 'characters.$.flags': flag } })`) rather than a full
  codex read-modify-write.
- **Chapter reorder** — a `bulkWrite` of per-chapter `updateOne({ _id },
  { $set: { order } })` operations instead of read-all/reorder-in-JS/write-all.
- **Draft history trimming** — `$push` with `$slice: -10` in the same update
  operator (atomic, no read-before-write).
- **`exportService`** — still needs full chapter content in memory to hand to
  pdfkit/nodepub/docx (unavoidable, it's assembling a document), but chapter
  fetch becomes one `Chapter.find({ workId }).sort({ order: 1 })` instead of
  index-then-N-file-reads.

## Server structure

- `server/src/db.js` (new) — `connectMongo()`: connects using the
  `MONGODB_URI` env var (default `mongodb://localhost:27017/scriptorium` for
  bare-metal `npm run dev` outside Docker). Exits the process with a clear
  log line if the initial connection fails — fail fast, no silent fallback.
- `server/src/models/` (new) — one Mongoose schema/model file per collection:
  `Work.js`, `Chapter.js`, `Codex.js`, `Map.js`, `Catch.js`, `Session.js`,
  `Settings.js`.
- `server/src/server.js` — `initDataDir()`'s filesystem setup is replaced
  with `await connectMongo()` before `app.listen`. The settings singleton is
  lazily created on first `getSettings()` call via
  `Settings.findOneAndUpdate(filter, update, { upsert: true, new: true })`.
- `server/src/services/fileService.js` is deleted, along with all its
  imports across the 9+ call-site files listed above.

## Dependencies

- `server/package.json`: add `mongoose` (`^8.x`).
- Drop the `uuid` dependency — it's listed but never imported anywhere in the
  codebase (dead weight, removed while this file is being touched anyway).

## Docker Compose

**Dev (`docker-compose.yml`)** — add a standalone `mongo` service (no
replica set — Scriptorium is single-user/local with no multi-doc transaction
need):

```yaml
mongo:
  image: mongo:8
  restart: unless-stopped
  volumes:
    - mongo-data:/data/db
  ports:
    - "27017:27017"
```

`server` gets `MONGODB_URI=mongodb://mongo:27017/scriptorium` and
`depends_on: [mongo]`. Top-level `volumes: { mongo-data: }` added. The
`./server/data` bind mount is removed from the `server` service.

**Prod (`docker-compose.prod.yml`)** — no `mongo` service defined here at
all, mirroring `finance-tracker`'s prod compose exactly. `scriptorium-server`
joins the existing external `shared-mongo` network (the same physical Mongo
container finance-tracker already uses) with a distinct database name for
isolation:

```yaml
environment:
  - PORT=3001
  - NODE_ENV=production
  - MONGODB_URI=mongodb://mongo:27017/scriptorium?replicaSet=rs0&directConnection=true
networks:
  - default
  - shared-mongo
```

plus, at the bottom:

```yaml
networks:
  shared-edge:
    external: true
  shared-mongo:
    external: true
```

The `./server/data` volume mount is removed from `scriptorium-server` here
too.

## Out of scope

- No data migration script — confirmed fresh start, existing `data/`
  directory on disk is left untouched but no longer read or written.
- No change to `shared-edge` networking, cloudflared, or any client-side
  code — the client only talks to `/api/*`, response shapes are preserved.
- No exposed Mongo port or backup tooling added to scriptorium's prod
  compose file — backups/administration of the shared Mongo instance remain
  finance-tracker's stack's responsibility, as today.
- No multi-document transactions — none of the current write patterns need
  them (draft history trimming, reorder, and word-count recalculation are
  all single-document or aggregation-only).
