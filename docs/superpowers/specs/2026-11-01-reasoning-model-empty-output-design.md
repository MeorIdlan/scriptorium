# Reasoning models return empty AI output: design

Date: 2026-11-01 · Card: https://trello.com/c/ZSIOIZan · Found by: https://trello.com/c/KkSqZMsx

## Intent

Reasoning models spend output tokens on hidden thinking, and thinking counts against the
request's token cap. Scriptorium sets small caps on purpose (chapter summaries 300, Polish
about 2.2 tokens per word plus 200, Quill actions 1500–2000), so on these models the whole cap
goes to thinking and the reply has no text. The writer sees "The AI returned an empty summary"
or Polish reporting passages as missing. A writer who picks a current model in `/settings`
should get working AI, whichever model it is.

## Failing today (real keys, 2026-11-01)

- Claude `claude-sonnet-5-5`, `claude-haiku-5-5` (think by default); `claude-opus-5-5` (thinking
  cannot be switched off).
- OpenAI `gpt-5-mini`, `o3`; `gpt-6-luna` intermittently (2 of 4 summaries empty).
- Working: `claude-sonnet-4-6`, `gpt-4o` (app defaults), `gpt-5.5`, `gpt-5.4-mini`.
- Repro: model `claude-sonnet-5-5`, `POST /api/works/:id/chapters/:id/summary/regenerate` returns
  502 `EMPTY_SUMMARY`; `POST /api/ai/polish-draft` with one target returns `missing: ["t1"]`.

## Goals

- Every AI call works on every model above, with no change to the caps callers set.
- The writer sees no new setting and no new step.
- A model the app has never heard of still works, or fails with a clear message.

## Non-goals

- A reasoning-effort setting in `/settings` (the dev chose not to add one).
- Letting a call site ask for more thinking. If a creative action ever wants it, that is a new card.
- The fixes already merged in PR #28 (`temperature`, thinking block before text, OpenAI
  `max_completion_tokens`).
- Changing the writer's `maxTokens` setting or its 256–8000 range.

## Anti-goals

- A fix that only handles the two reproduced calls (summaries, Polish) and leaves Quill actions
  empty on the same models.
- Silent token cost: no blanket headroom on every call.
- A hard-coded list of model names that breaks the moment a new model ships.

## Decisions (the dev's)

1. **Approach:** thinking control and one retry, inside the adapters. Not a setting, not
   blanket headroom.
2. **Scope:** every AI call, via the shared adapters (`providers/anthropic.js`, `providers/openai.js`).
3. **Models whose thinking can't be switched off** (Opus 5.5, o3): send the lowest effort the
   model accepts; if the reply is still empty because the cap was hit, retry once with a larger
   cap, then fail with a clear error.
4. **Verification:** adapter tests with faked provider replies, then a real-key run on the six
   failing models. The dev supplies keys at that point and revokes them afterwards.

## Behavior

For each `complete()` call the adapter does the following.

1. **Ask for the least thinking.** Pick the thinking control from the model id:
   - Claude: `thinking: {type: 'disabled'}` for models that accept it (Haiku, Sonnet 4.6, Opus 4.8);
     `{type: 'between_tools'}` for Sonnet 5.5; the lowest effort setting for Opus 5.5.
   - OpenAI: the lowest `reasoning_effort` the model accepts; nothing for models that don't
     reason (`gpt-4o`).
   - Unknown model: send nothing extra on the first attempt.
2. **Learn from rejection.** When the API answers 400 and its message names the thinking or
   effort parameter, retry once using the control the message points to (or with it removed),
   the same pattern the `temperature` retry already uses. Other 400s are not retried.
3. **Recover from a cut-off.** If the reply has no text and the provider reports the cap was hit
   (Anthropic `stop_reason: 'max_tokens'`, OpenAI `finish_reason: 'length'`), retry once with the
   cap raised. If that reply is also empty, throw an error whose message says the model used its
   whole budget thinking and suggests another model. An empty reply for any other reason is
   returned as today (callers already handle `''`).
4. **Remember nothing.** No per-user state, no stored capability flags; each call derives its
   request from the model id and the replies it gets. At most two extra requests per call.

## Constraints

- Callers keep passing `maxTokens`; `llmService.complete()` still returns a string.
- The retry cap must respect the 8000 ceiling the settings route allows.
- `@anthropic-ai/sdk` is `^0.27.0` and `openai` is `^4.52.0`. Both pass unknown body fields
  through at runtime, but their TypeScript-style types predate `thinking` and effort. Do not
  upgrade the SDKs inside this card unless a field is dropped.
- The exact request fields and 400 messages for each model are known only from the card's
  notes. The real-key run (A5) is the source of truth; the table and tests are corrected to it.
- Server tests run under `node --test`; the existing adapter tests (`anthropicTemperature.test.js`,
  `openaiParams.test.js`) mock the SDK's `create` and are the pattern to follow.
- Secrets: keys are never written to files, commits, notes or logs.

## My calls (the dev can override)

- The retry cap is 4× the original, bounded at 8000.
- The model-family table lives in one small module shared by both adapters' tests, and holds
  hints, not guarantees: every entry is backed by the rejection fallback in step 2.
- `/settings/test` ("Test Connection", `maxTokens: 10`) goes through the same adapter path, so it
  also benefits from the retry; no change to the route.
- `gpt-6-luna`'s intermittent empties are treated as the same bug (thinking used the cap). If the
  real-key run shows another cause, the card gets a comment and a follow-up instead of a guess.
- **Request budget:** a hard ceiling of 3 requests per `complete()` call: the first, plus at most
  one rejection retry (one retry covers `temperature` and the thinking control together, removing
  or swapping whichever parameter the message names), plus at most one cut-off retry. A call that
  needs more fails with the last error.
- **Rejection fallback:** match the 400 message against the parameter names (`temperature`,
  `thinking`, `effort`). On a match, the fallback is always "remove that control and retry once",
  never a parsed suggestion. The model table decides what is sent first; the 400 only ever removes.
  The real-key spike (below) decides whether Sonnet 5.5's `between_tools` and Opus 5.5's effort
  field need to be the first attempt.
- **"Empty" means the extracted text is blank after trimming,** and the cut-off retry fires only
  when the provider's stop reason says the cap was hit. Both adapters share one `isCutOffEmpty`
  helper.
- **Retry cap:** `min(8000, max(originalCap * 4, 1024))`. Skip the retry when the original is
  already 8000 and fail at once. The 1024 floor means a 10-token Test Connection call gets a
  usable retry. For Claude, any `thinking.budget_tokens` stays below `max_tokens`.
- **Models that work today get no extra parameter.** The table sends a control only to families
  known to need one (Claude 5.5 family, `o3`, `gpt-5-mini`). `gpt-5.5`, `gpt-5.4-mini`, `gpt-4o`
  and unknown ids send nothing on the first attempt, so A6 holds and a new model is covered by
  the cut-off retry. The table is production code, matched by id prefix and imported by the
  adapters.
- **Final failure:** the adapter throws an `Error` with `code: 'AI_OUTPUT_CUT_OFF'` and
  `status: 502`. It reaches the writer through the routes' existing `next(err)` path and the
  client's message display. The builder confirms the error handler honours `err.status` and
  adds a route mapping only if it doesn't. Summaries keep their `EMPTY_SUMMARY` mapping for a
  model that returns a blank reply without being cut off.
- **Streaming** is not used anywhere in the adapters, so it is out of scope.
- **Key handling for the real-key run:** the dev puts keys in environment variables for one
  shell command at a time. A script in the session scratchpad reads them and logs only model,
  status and reply length. For `gpt-6-luna` and the other intermittent case, judge on 5 runs of
  each action, all non-empty.

## Real-key discovery spike (first plan task)

The exact request fields and 400 messages are unknown (see Constraints), so the plan starts
with a throwaway scratchpad script, not committed, that calls each of the six failing models and
the four working ones with candidate controls and records which are accepted and the exact 400
text. Its findings fix the model table and the test fixtures before the adapter work begins. The
dev supplies keys for the spike and revokes them afterwards; A5 reuses the same keys.

## Left to the builder

- File and function layout inside the adapters; how the table is expressed.
- The error wording, within the clear-message requirement.
- Test names and fixtures.

## Proposed acceptance criteria (for the dev's approval; not yet on the card)

- **A1.** A Claude reply with no text and `stop_reason: 'max_tokens'` is retried once with a
  larger cap and returns the retried text. Proof: adapter test.
- **A2.** An OpenAI reply with no text and `finish_reason: 'length'` is retried the same way.
  Proof: adapter test.
- **A3.** A 400 that rejects the thinking or effort parameter is retried once with the accepted
  control; unrelated 400s are not retried. Proof: adapter tests for each adapter.
- **A4.** A second empty cut-off reply fails with an error that names the cause and suggests
  another model. Proof: adapter test.
- **A5.** With real keys, summary regeneration and Polish (one target) return text on
  `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`, `gpt-5-mini`, `o3` and
  `gpt-6-luna`, and still work on `claude-sonnet-4-6` and `gpt-4o`. Proof: command output from
  the verification run, with no keys recorded.
- **A6.** No call that worked before (`claude-sonnet-4-6`, `gpt-4o`, `gpt-5.5`, `gpt-5.4-mini`)
  makes more requests than before on a normal reply. Proof: adapter tests count requests.
- **A7.** The full server and client suites pass. Proof: test output.
