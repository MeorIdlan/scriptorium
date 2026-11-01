# Reasoning-model empty output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI call return text on reasoning models by asking the provider for the least thinking, and recovering once when a cut-off still leaves the reply empty.

**Architecture:** One shared module (`providers/reasoning.js`) holds the model-family table, the rejection-stripping rule, the retry-cap rule and the recovery loop. The Anthropic and OpenAI adapters wrap their SDK call in that loop and say how to read a reply. Callers, caps and settings are untouched. The table and test fixtures come from a real-key probe run first, not from the card's notes.

**Tech Stack:** Node ESM, `@anthropic-ai/sdk` ^0.27.0, `openai` ^4.52.0, `node --test` with `mock.method` on the SDK `create` methods.

**Spec:** `docs/superpowers/specs/2026-11-01-reasoning-model-empty-output-design.md`
**Card:** https://trello.com/c/ZSIOIZan (every commit body ends with `Trello: https://trello.com/c/ZSIOIZan`)

## Global Constraints

- At most **3 requests per `complete()` call**: the first, at most one rejection retry, at most one cut-off retry.
- Retry cap = `min(8000, max(originalCap * 4, 1024))`; no cut-off retry when the original cap is already 8000.
- A 400 whose message names a parameter we sent (`temperature`, or a thinking/effort control) is retried once with every named parameter removed. Other 400s, and every non-400 error, are never retried.
- "Empty" means the extracted text is blank after trimming. The cut-off retry fires only when the provider says the cap was hit (Anthropic `stop_reason: 'max_tokens'`, OpenAI `finish_reason: 'length'`).
- Models that work today (`claude-sonnet-4-6`, `gpt-4o`, `gpt-5.5`, `gpt-5.4-mini`) and unknown model ids get **no** extra parameter on the first attempt.
- A second cut-off empty reply throws an `Error` with `code: 'AI_OUTPUT_CUT_OFF'`, `status: 502`, whose message names the cause and suggests another model.
- No new setting, no change to callers' caps or to `llmService.complete()`'s string return. No SDK upgrades.
- API keys live only in environment variables for one command at a time. They are never written to files, commits, notes, logs or replies.

## Review Focus

Failure modes the spec implies that no acceptance criterion pins; each has its test in the task named.

1. A reply with real text that was cut off (`stop_reason: 'max_tokens'`) is returned as is, never retried. (Tasks 3, 4)
2. A whitespace-only reply that was cut off counts as empty and is retried. (Tasks 2, 3)
3. A call whose cap is already 8000 and gets cut off fails at once with `AI_OUTPUT_CUT_OFF`, with no pointless retry. (Tasks 2, 4)
4. Test Connection (`maxTokens: 10`) gets a usable retry cap of 1024. (Task 2)
5. A 400 that names both `temperature` and the thinking control is fixed by one retry; a second, different rejection after that fails with that error instead of a third request. (Tasks 2, 3)

## File Structure

- Create `server/src/services/providers/reasoning.js`: table, `requestControls`, `withoutRejected`, `retryCap`, `isBlank`, `cutOffError`, `runRecovering`. One responsibility: provider-neutral recovery rules.
- Modify `server/src/services/providers/anthropic.js`, `openai.js`: build params, delegate to `runRecovering`, supply `send` and `read`.
- Create tests: `server/test/reasoning.test.js`, `anthropicReasoning.test.js`, `openaiReasoning.test.js`.
- Create fixture `server/test/fixtures/reasoningProbe.json` (Task 1 output, no secrets).
- Not committed: the probe script and the verification script, both in the session scratchpad.

---

### Task 1: Real-key probe (throwaway spike, no TDD)

Proves which controls each model accepts and records the exact 400 text. Gates the rest of the plan. Delivers no production code. Supports A3 and A5.

**Files:**
- Create (committed): `server/test/fixtures/reasoningProbe.json`
- Create (scratchpad, not committed): `<scratchpad>/probe-reasoning.mjs`

**Interfaces:**
- Produces: `reasoningProbe.json`, an array of `{ provider, model, worksToday: boolean, attempts: Array<{ controls: object, status: number|'ok', stopReason: string|null, textLength: number, error: string|null }> }`. One attempt per candidate control set. `error` is the verbatim 400 message with any `req_…`/request id removed. Tasks 2–4 read it.

- [ ] **Step 1: Ask the dev for keys.** `AskUserQuestion`: the dev supplies keys at this point, as env vars for one command (`! ANTHROPIC_API_KEY=… OPENAI_API_KEY=… node <script>`), and revokes them after Task 5. Keys never enter a file or reply.
- [ ] **Step 2: Write the probe script.** For each of the ten models (`claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`, `gpt-5-mini`, `o3`, `gpt-6-luna`, plus the working `claude-sonnet-4-6`, `gpt-4o`, `gpt-5.5`, `gpt-5.4-mini`) send a 300-token request ("Summarize in one sentence: …") with each candidate: no control; Claude `thinking: {type:'disabled'}`, `{type:'between_tools'}`, an effort field (try `output_config: {effort:'low'}` first, then whatever the 400 messages hint at); OpenAI `reasoning_effort` of `'minimal'` and `'low'`. Also send each Claude model `temperature: 0.7` once. Call the SDKs directly. Print only model, control, status, stop reason, text length and the redacted error. For `gpt-6-luna` repeat the no-control attempt 4 times.
- [ ] **Step 3: Run it** with the keys in the environment. Expected: a table of accepted and rejected controls per model.
- [ ] **Step 4: Write `reasoningProbe.json`** from the output. Check it with `grep -iE "sk-|api[_-]?key|req_" server/test/fixtures/reasoningProbe.json` (expected: no matches).
- [ ] **Step 5: Commit** `test(ai): record real reasoning-model probe results`.
- [ ] **Step 6: Report** to the dev anything that contradicts the spec (a model that needs a different first attempt, `gpt-6-luna` failing for another reason). A contradiction stops the plan for the dev's decision (spec: "My calls").

---

### Task 2: Shared recovery rules (`reasoning.js`) → A3, A4

**Files:**
- Create: `server/src/services/providers/reasoning.js`
- Test: `server/test/reasoning.test.js`

**Interfaces:**
- Consumes: `reasoningProbe.json` from Task 1.
- Produces (all exported from `reasoning.js`):
  - `requestControls(provider: 'anthropic'|'openai', model: string): { temperature: boolean, controls: Array<{ field: string, value: unknown, match: RegExp }> }`. Matched by model-id prefix. Unknown and working-today ids return `{ temperature: true, controls: [] }`. Entries and the `temperature` flag come from the probe fixture.
  - `withoutRejected(err: Error, params: object, controls): object | null`. A copy of `params` without `temperature` and without each control field whose `match` (or `/temperature/i`) hits the message, only when `err.status === 400` and at least one was named; otherwise `null`.
  - `retryCap(cap: number): number | null` (spec formula; `null` when `cap >= 8000`).
  - `isBlank(text: string | null | undefined): boolean`.
  - `cutOffError(model: string): Error` (`code 'AI_OUTPUT_CUT_OFF'`, `status 502`).
  - `runRecovering({ model, params, controls, capField, send, read }): Promise<string>`. `send(params)` returns the raw reply; `read(raw)` returns `{ text, cutOff }`; `capField` is `'max_tokens'` or `'max_completion_tokens'`.

- [ ] **Step 1: Write the failing tests** in `reasoning.test.js`:
  - `retryCap`: `10 → 1024`, `300 → 1200`, `3000 → 8000`, `8000 → null`.
  - `isBlank`: `''`, `'  \n'`, `null` are blank; `'a'` is not.
  - `withoutRejected` strips `temperature` only for a 400 saying "`temperature` is deprecated", strips both `temperature` and the thinking control for a message naming both, returns `null` for a 400 naming neither, and `null` for a 429 naming `temperature`.
  - `requestControls` fixture check: for every fixture model with `worksToday: true` the controls are `[]`; for every other model every `{field, value}` the table sends appears in an attempt marked accepted (`status: 'ok'`).
  - `cutOffError('m')`: `code`, `status`, message contains the model id and "another model".
  - `runRecovering` with a fake `send`: normal reply → 1 request; blank + `cutOff` → second request with `capField` = `retryCap(original)`; blank + `cutOff` twice → rejects with `AI_OUTPUT_CUT_OFF` after 2 requests; blank + `cutOff` at cap 8000 → rejects after 1 request; whitespace-only + `cutOff` retries (Review Focus 2); text + `cutOff` returns the text after 1 request (Review Focus 1); rejection 400 then success → 2 requests with the control removed; rejection 400, then a different rejection 400 → rejects with the second error after 2 requests (Review Focus 5); rejection then cut-off then blank → 3 requests then `AI_OUTPUT_CUT_OFF`, never a 4th; 500 → 1 request, rethrown.
- [ ] **Step 2: Run** `cd server && node --test test/reasoning.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `reasoning.js` to the Interfaces above. The loop removes rejected parameters at most once, retries a cut-off at most once, and leaves both counters in one place so the 3-request ceiling is visible.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): shared rules for thinking control and cut-off recovery`.

---

### Task 3: Anthropic adapter → A1, A3, A4, A6

**Files:**
- Modify: `server/src/services/providers/anthropic.js` (`complete`)
- Test: `server/test/anthropicReasoning.test.js` (mirror `anthropicTemperature.test.js`: mock `Anthropic.Messages.prototype.create`)

**Interfaces:**
- Consumes: `requestControls`, `runRecovering` from Task 2.
- Produces: `complete({ apiKey, model, system, prompt, maxTokens, temperature }): Promise<string>`, same signature and string return as today.

- [ ] **Step 1: Write the failing tests:**
  - A1: `claude-sonnet-5-5`, first reply `{content:[{type:'thinking'}], stop_reason:'max_tokens'}`, second `{content:[{type:'text',text:'ok'}]}` → returns `'ok'`; `sent[1].max_tokens === retryCap(50)`.
  - A3: a 400 naming the thinking control (message from the fixture) → retried once without it; a 400 `'model: not found'` → 1 request.
  - A4: two cut-off empties → rejects `/another model/` with `code === 'AI_OUTPUT_CUT_OFF'`; 2 requests.
  - A6: for `claude-sonnet-4-6` and unknown `claude-x`, a normal reply makes exactly 1 request and sends no `thinking` field.
  - Review Focus 1: text plus `stop_reason: 'max_tokens'` returns the text, 1 request.
  - For each fixture model that needs a control, the first request carries the control the table names.
- [ ] **Step 2: Run** `cd server && node --test test/anthropicReasoning.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Spread `controls` onto the request, set `temperature` only when the table allows it, call `runRecovering` with `capField: 'max_tokens'`; `read` joins the text blocks (as today) and sets `cutOff` from `stop_reason === 'max_tokens'`. Delete the adapter's own temperature retry; `withoutRejected` replaces it.
- [ ] **Step 4: Run** `cd server && node --test test/anthropicReasoning.test.js test/anthropicTemperature.test.js`. Expected: PASS (the old temperature tests must still pass unchanged).
- [ ] **Step 5: Commit** `feat(ai): control thinking and recover cut-off replies for Claude`.

---

### Task 4: OpenAI adapter → A2, A3, A4, A6

**Files:**
- Modify: `server/src/services/providers/openai.js` (`complete`)
- Test: `server/test/openaiReasoning.test.js` (mirror `openaiParams.test.js`)

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `complete(...)`, same signature; returns `''` instead of `null` when the message content is null.

- [ ] **Step 1: Write the failing tests:**
  - A2: `gpt-5-mini`, reply `{choices:[{message:{content:null},finish_reason:'length'}]}` then text → returns the text; `sent[1].max_completion_tokens === retryCap(50)`.
  - A3: a 400 naming `reasoning_effort` (message from the fixture) → retried once without it; an unrelated 400 → 1 request.
  - A4: two cut-off empties → `AI_OUTPUT_CUT_OFF`, 2 requests.
  - A6: `gpt-4o`, `gpt-5.5`, `gpt-5.4-mini` and unknown `gpt-x`, normal reply → exactly 1 request, no effort field.
  - Review Focus 3: `maxTokens: 8000` and a cut-off empty → rejects after 1 request.
  - Review Focus 1: text plus `finish_reason: 'length'` returns the text, 1 request.
- [ ] **Step 2: Run** `cd server && node --test test/openaiReasoning.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Same shape as Task 3 with `capField: 'max_completion_tokens'`; `read` returns `{ text: content ?? '', cutOff: finish_reason === 'length' }`.
- [ ] **Step 4: Run** `cd server && node --test test/openaiReasoning.test.js test/openaiParams.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): control reasoning effort and recover cut-off replies for OpenAI`.

---

### Task 5: Real-key verification → A5, and A6 end to end

Re-runs the repro through the real routes. Delivers evidence, not code.

**Files:**
- Create (scratchpad, not committed): `<scratchpad>/verify-reasoning.mjs`

**Interfaces:**
- Consumes: the HTTP harness in `server/test/support/http.js` (in-memory MongoDB, so keys never reach a persistent database).

- [ ] **Step 1: Ask the dev for keys again** (same terms as Task 1; reuse if still valid).
- [ ] **Step 2: Write the script.** Boot the app with the harness, create a work with a chapter of a few paragraphs, and for each of the ten models save the key and model through `PUT /api/settings`, then call `POST /api/works/:id/chapters/:id/summary/regenerate` and `POST /api/ai/polish-draft` with one target. For `gpt-6-luna` run each action 5 times. Print model, action, HTTP status and reply length only.
- [ ] **Step 3: Run it** with keys in the environment. Expected: 200 and a non-empty result for all ten models on both actions; all five `gpt-6-luna` runs non-empty.
- [ ] **Step 4: Record** the output table (no keys) for the card comment. A failure on any model goes back to Task 2's table with a new fixture entry and a new test, then Task 5 repeats.
- [ ] **Step 5: Tell the dev the keys can be revoked.**

---

### Task 6: Full suites → A7

- [ ] **Step 1: Run** `cd server && npm test`. Expected: 0 failures.
- [ ] **Step 2: Run** `cd client && npm test`. Expected: 0 failures.
- [ ] **Step 3: Report** the real pass counts and any failure verbatim. Failures are fixed, not reported as done.

---

## Acceptance coverage

| Criterion | Proven by |
|---|---|
| A1 | Task 3 test "A1" (Claude cut-off retried with a larger cap) |
| A2 | Task 4 test "A2" (OpenAI cut-off retried) |
| A3 | Tasks 2, 3, 4 rejection tests (`withoutRejected`; Claude and OpenAI adapters) |
| A4 | Task 2 `runRecovering` test, Tasks 3 and 4 "A4" tests |
| A5 | Task 5 command output across ten models |
| A6 | Tasks 3 and 4 "A6" request-count tests; Task 5 end to end |
| A7 | Task 6 test output |
