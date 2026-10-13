# Daily word goal with live progress — design

Trello: https://trello.com/c/nDeLSYIe (FR-18, epic Progress). Track: architectural.

## Goal and scope

The writer sets a daily word goal and sees today's progress toward it while writing. The count is the net words the writer added today, and it resets each day in the writer's own timezone. Deleting or moving text never lowers the count.

Decisions made in Gate 3:

- **Q-2 (scope):** the goal is per writer, not per work. Today's count sums gains across all of the writer's works.
- **Day rule (A4):** gains only. A chapter save adds `max(0, new − old)` words. Decreases are ignored, so deleting never lowers today's count. Moving text across saves counts as new words; moving within a single save adds nothing.
- **Timezone (A3):** the browser's IANA timezone, sent as an `X-Timezone` header. A missing or invalid zone falls back to UTC and never fails a save.
- **Counting point:** the server counts gains on chapter save, not the client. This is the single source of truth for every save path, and two tabs on the same chapter don't double-count.

Out of scope: the per-sitting goal and cue (FR-29, MVP 2), the calendar and streaks (FR-28), and counting restores, bring-backs or deletes toward the day.

## Data

- **`DailyProgress`** (new, `server/src/models/DailyProgress.js`): `_id` = `${userId}_${YYYY-MM-DD}`, plus `userId`, `date`, `words` (integer, default 0) and `updatedAt`.
- **`Settings.dailyWordGoal`** (new field on the existing `Settings` document, `_id` = user id): integer 1–100000, or unset/`null` for no goal.
- **`Session`** is unchanged. It records writing sittings, not days.

## Server

- **Day key:** `dayKey(now, timeZone)` in `wordCountService.js` returns `YYYY-MM-DD` in the given IANA zone. An invalid zone uses UTC.
- **Gain:** `gainFor(oldWords, newWords)` returns `Math.max(0, newWords − oldWords)`.
- **Chapter save** (`PUT /api/works/:workId/chapters/:chapterId`, `routes/chapters.js`): the old `wordCount` comes from the pre-update document of the same atomic `findOneAndUpdate` that writes the new one. If the gain is above zero, the server does `$inc` on today's `DailyProgress` for the user, with the day key from the request. Zero gains skip the write.
- **`GET /api/progress/today`** → `{ date, words, goal }`. `words` is today's total for the signed-in writer. `goal` is `Settings.dailyWordGoal` or `null`.
- **`PUT /api/progress/goal`** with `{ goal }`, an integer 1–100000 or `null`. Anything else gets a 400. It upserts `Settings.dailyWordGoal`.
- Both routes are in `routes/progress.js`, mounted at `/api/progress` behind `requireAuth`. They use the signed-in user, not `loadWork`, because the goal and the count belong to the writer.

## Client

- **`utils/api.js`** sends `X-Timezone` with every request, from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **`hooks/useDailyProgress.js`** (new) loads `/today` and exposes `{ words, goal, pendingGain }`. `pendingGain` is the current chapter's count minus its count at the last successful save, floored at zero. The hook refetches after each successful autosave.
- **`components/editor/WordCounter.jsx`** shows "Today N / goal words" with a thin bar when a goal is set. N is `words + pendingGain`, so it moves as the writer types. With no goal it shows today's count only. If `/today` fails, the daily part hides and the rest of the counter still works.
- **Settings page:** a "Daily word goal" field that saves through `PUT /api/progress/goal`, with a Clear button that sends `null`.

## Errors

- A failed `/today` hides the daily part of the counter. Nothing else breaks.
- An invalid goal gets a 400 `INVALID_GOAL`. The settings field shows the message.
- A missing or invalid `X-Timezone` falls back to UTC silently.
- A failed progress write on chapter save is logged and does not fail the save, matching how the snapshot and scan steps already behave.

## Testing (A5)

- **Unit (`node --test`):** `gainFor` clamps at zero (A4). `dayKey` covers the midnight boundary in two zones and the invalid-zone fallback (A3).
- **HTTP (in-memory Mongo):** a chapter save adds its gain. Deleting text adds nothing. Two saves add up. `/today` returns the total. Goal set, clear and invalid values behave as specified. Another writer's counts are not visible. The day boundary is checked by sending `X-Timezone` at 23:59 and 00:01 local time.
- **Client (linkedom):** the `pendingGain` math, and the counter in the goal and no-goal states.

## Open items

- The card's file list named `models/Session.js` and `routes/sessions.js`. Neither is changed, because they record sittings rather than days.
