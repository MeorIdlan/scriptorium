# Plot threads — design

First story of the Plot threads epic (FR-14, PRD Q-1). The writer defines the
plot threads of a work: subplots, mysteries and arcs they must not drop. Tagging
scenes and chapters (FR-15), Map lanes (FR-16) and AI context (FR-17) are later
stories, but this spec fixes where tags are stored so that deleting a thread can
clean them up now and the later stories build on a settled format.

Card: https://trello.com/c/Lj8zufyf

## Problem

- A long book has subplots, mysteries and arcs that get dropped. The app has no
  way to name them, give them a colour or record whether they are resolved.
- The rest of the epic needs a thread to point at, and a known place where tags
  are stored.

## Goals

1. The writer creates, renames, recolours, describes and deletes plot threads
   for a work.
2. Each thread has a status, open or resolved, that the writer can change.
3. Threads are stored per work and only reachable by the work's owner.
4. Deleting a thread removes it from everything it was tagged on.
5. Tests cover create/update/delete and the ownership check, against a real
   database.

## Decisions (made with the dev)

| Question | Decision |
|---|---|
| Q-1: what a thread can be tagged on | Scenes **and** chapters. Writers who don't use scene breaks can still tag chapters. A chapter counts as touching a thread if the chapter or any of its scenes is tagged. |
| Delete scope | Strip the id from every live chapter of the work. Snapshots are history and stay as they are. Any id that isn't a current thread is ignored wherever tags are read, and dropped on the next save, so a restored snapshot can't bring a deleted thread back. |
| Storage | A `PlotThread` collection, one document per thread (not an array on `Map` or `Work`). |
| Where threads are managed | A "Plot threads" section on the Map page, under the beat row. |
| Test setup | `mongodb-memory-server` + `supertest` HTTP tests against the real routers. |
| Colour | Defaults to the next colour of an 8-colour preset palette; any `#rrggbb` is accepted. |
| Delete confirmation count | Computed on the client from the loaded chapters (no dry-run endpoint). |

## Data

### `PlotThread` (`server/src/models/PlotThread.js`)

| Field | Rule |
|---|---|
| `_id` | `thr_<ms>_<6 hex>`, same style as scene ids |
| `workId` | required, indexed |
| `name` | required, trimmed, 1–80 chars, unique within the work, case-insensitive |
| `color` | `#rrggbb` (lowercased); default = next palette colour |
| `description` | trimmed, 0–1000 chars, default `''` |
| `status` | `open` or `resolved`, default `open` |
| `order` | number; a new thread goes after the last one |
| `createdAt`, `updatedAt` | ISO strings, like the other models |

`toJSON` uses the shared `idTransform` (`_id` → `id`).

Palette (dark-theme friendly, in this order):
`#c9a96e` gold, `#7fa7d9` blue, `#d97f7f` red, `#8fc98f` green,
`#b58fd9` violet, `#d9a35f` amber, `#6fc2c2` teal, `#d98fb8` rose. The default
is `palette[count % 8]`, where `count` is the number of threads already in the work.

### Tags

This story defines the format and keeps it through saves. Setting tags from the
UI comes in the next story.

- **Scene tags:** `data-threads="thr_a thr_b"` (space-separated ids) on the
  scene's `<hr data-scene …>` marker in `contentHtml`. Because tags live on the
  marker, they move with the scene through scene moves, snapshot restore and
  bringing a chapter back.
  - `htmlService` keeps `data-threads` when it rebuilds marker attributes. It
    only keeps ids that match `thr_[A-Za-z0-9_]+`, drops duplicates, and leaves
    the attribute off when nothing is left.
  - `sceneMarkers.parseScenes` and `sceneSummaries` (which builds the stored
    `Chapter.scenes`) expose `threadIds: string[]` on
    each scene.
  - The client's `utils/scenes.js` reads and writes the same attribute so editor
    round trips keep it.
- **Chapter tags:** `Chapter.threadIds: [String]`, default `[]`. They apply
  whether or not the chapter has scenes.
- **Strays:** `knownThreadIds(ids, knownSet)` (in `services/threadTags.js`)
  returns only the ids that are current threads of the work. Later stories call
  it wherever tags are read (Map lanes, AI context) and saved. In this story it
  is used by the delete cleanup and covered by unit tests.

## API

Router `server/src/routes/threads.js`, mounted in `server.js` as
`/api/works/:workId/threads` behind `auth`, with `router.use(loadWork)`.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/` | — | `200` threads of the work, sorted by `order` |
| POST | `/` | `{ name, color?, description?, status? }` | `201` the new thread |
| PUT | `/reorder` | `{ ids: [...] }` (every thread id of the work, once) | `200` threads in the new order |
| PUT | `/:threadId` | any of `name`, `color`, `description`, `status` | `200` the updated thread |
| DELETE | `/:threadId` | — | `204` |

- **Fields:** `services/threadFields.js` whitelists and validates fields, like
  `catchFields.js`. An unknown field or a bad value returns
  `400 INVALID_FIELD` with the field name in the message. A missing name on
  create returns `400 MISSING_FIELD`.
- **Duplicate name** (case-insensitive, within the work) returns
  `409 DUPLICATE_NAME`, on create and on rename.
- **Ownership:** `loadWork` 404s for a work the user doesn't own. Every thread
  query filters on `{ _id: threadId, workId }`, so a thread id from another work,
  even one of the same user's, is `404 NOT_FOUND`.
- **Reorder:** `400 INVALID_FIELD` unless `ids` is exactly the work's thread
  ids, each once.

### Delete cleanup (`services/threadCleanup.js`)

`removeThreadFromWork(workId, threadId)`:

1. Delete the `PlotThread` document (404 if it isn't in this work).
2. Find the work's chapters where `threadIds` contains the id, or `contentHtml`
   contains it.
3. For each one: pull the id from `threadIds`, rewrite `contentHtml` with
   `stripThreadFromHtml(html, threadId)` (it removes the id from every marker's
   `data-threads` and leaves the rest of the HTML untouched), then recompute
   `scenes` with `sceneSummaries`. Write with `updateOne` per chapter.

The thread is deleted before the chapters are cleaned. If the cleanup fails
partway, the leftover ids are strays, which the read-side filter ignores, so the
writer never sees a deleted thread. Snapshots aren't changed.

`stripThreadFromHtml` changes only the marker attributes. It doesn't re-run the
sanitiser, so the stored HTML is otherwise byte-for-byte the same.

### Deleting a work

`deleteWorkCascade` in `services/workService.js` (used by
`DELETE /api/works/:workId`) also runs `PlotThread.deleteMany({ workId })`.

## Client

- `ActiveWorkContext`: `threads` state (`[]` on load), `refreshThreads(workId)`,
  and `SET_THREADS`. `MapView` calls `refreshThreads` alongside `refreshMap`.
- `components/map/ThreadManager.jsx`: a "Plot threads" section under the beat
  row. It holds the list, a **New thread** button and an empty state ("No plot
  threads yet. Add the subplots and mysteries you need to keep track of.").
- `components/map/ThreadRow.jsx`, one per thread:
  - Colour swatch that opens a small popover with the 8 palette colours and a
    native `<input type="color">`.
  - Name, click to edit inline; Enter or blur saves, Escape cancels.
  - **Open / Resolved** toggle.
  - Description, collapsed to one line, expands to a textarea; blur saves.
  - Delete button. It confirms "Delete '<name>'? It's tagged on N chapters and
    scenes; the tags will be removed." N is counted from the loaded chapters
    (`threadIds` plus their scenes' `threadIds`). With N = 0 the second sentence
    is left out.
- **New thread** adds a row whose name field is focused. The server picks the
  colour.
- Server errors (duplicate name, too long) show inline under the row, and the
  field keeps what the writer typed.
- Calls go through `utils/api.js` (`api.get/post/put/delete`).
- Styles go in `index.css` with the existing variables (gold accent, Georgia,
  dark surfaces).

## Testing

**Server, HTTP against a real database** (`mongodb-memory-server` + `supertest`,
dev dependencies only):

- `test/support/app.js` starts an in-memory Mongo, connects mongoose, and builds
  an Express app with the real works and threads routers and `errorHandler`.
  `req.user` is set from an `x-test-user` header in place of `requireAuth`.
- `threads.routes.test.js`:
  - create → list → rename → recolour → describe → resolve → reopen → delete
  - defaults (palette colour, `open`, order)
  - validation 400s, duplicate-name 409 (create and rename, any case)
  - reorder, and a bad reorder 400
  - user B gets 404 on every verb for user A's work; a thread id from another
    of A's works gets 404
  - delete strips the id from `Chapter.threadIds`, from scene markers in
    `contentHtml` and from the derived `scenes`; other threads' tags and the
    rest of the HTML are unchanged; snapshots are unchanged
  - deleting a work deletes its threads

**Server, unit:** `threadFields` (each rule), `stripThreadFromHtml`,
`knownThreadIds`, `htmlService` keeping and cleaning `data-threads`, and
`sceneMarkers` exposing `threadIds`.

**Client** (linkedom, `api` stubbed): `ThreadManager` renders threads and the
empty state, creates a thread, toggles status, shows a server error inline, and
confirms delete with the tag count. `utils/scenes.js` round-trips `data-threads`.

**CI:** `.github/workflows/test.yml` caches `~/.cache/mongodb-binaries` (keyed
on the server lockfile), so the mongod binary is downloaded once.

## Out of scope

- Setting or clearing tags in the editor or Scenes tab (next story, FR-15).
- Map lanes, gap highlighting, open-at-end list (FR-16).
- Threads in the AI story context (FR-17).
- Rewriting snapshots on delete.
- Drag-to-reorder UI. The reorder endpoint exists, and the lanes story decides
  whether it needs a UI.
