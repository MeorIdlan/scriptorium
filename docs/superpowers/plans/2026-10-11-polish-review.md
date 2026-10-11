# Polish Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Polish reviewable: the AI rewrites only the chapter or the selected sentences, the writer accepts or rejects each changed sentence in a review modal, and applying keeps all untouched formatting.

**Architecture:** The server sends the AI numbered target passages (`[[t1]] … [[/t1]]`) plus the whole chapter and story context, and parses the marked rewrites back (`polishService.js`). The client splits the editor DOM into blocks (`editorBlocks.js`), batches targets to ≤1,500 words per request, diffs each rewrite into sentence-level changes (`polishDiff.js`), and writes accepted changes into the live editor DOM by text offset (`applyPolish.js`) so formatting outside each change survives.

**Tech Stack:** Express 4 + Mongoose 8 (ESM), React 18 + Vite 5, Node 24 built-in test runner, `linkedom` 0.18.13 (client dev dependency, tests only).

**Spec:** `docs/superpowers/specs/2026-10-11-polish-review-design.md`

## Global Constraints

- Branch: `feat/polish-review`. Commit after every task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server and client are ESM. Only new dependency: `linkedom@0.18.13` as a **client devDependency**.
- Targets: ≤ **1,500** words per client request (`batchTargets`), server rejects > **2,000** target words with `400 TOO_LONG`.
- `chapterText` is middle-truncated above **60,000** characters (`truncateMiddle`).
- Output cap: `maxTokensOverride = min(8000, ceil(targetWords × 2.2) + 200)`.
- Polish story context needs: `{ story: true, codex: true, summaries: 'before', mapBeat: true }`, `sourceText` = target texts joined.
- Changes start `pending`; Apply writes only `accepted` changes; Apply is disabled while any part is running or nothing is accepted.
- A block whose text changed since the session started has all its changes skipped and counted.
- The modal only closes via Discard / ✕ / Apply (no backdrop-click close), so a review isn't lost by a stray click.
- The editor element is found with `document.querySelector('.editor')` (existing pattern in `HookGenerator.jsx`).
- Node commands run directly in the WSL shell. Server tests: `npm --prefix server test`; client tests: `npm --prefix client test`.

## Review Focus

1. **Chrome's contentEditable structure** — the first line is often bare text before the first `<div>`, blocks can contain `<br>`, and nested `<div>`s appear after paste. Targets, offsets and apply must handle all three without shifting text. (Tests in Tasks 4 and 5.)
2. **Sentence splitting on abbreviations and dialogue** — `Mr. Vell`, `Dr. Ash`, `"Run!" she said.` and line breaks must not produce changes that cut words or swallow spaces when applied. (Tests in Task 3.)
3. **The writer edits text between polishing and applying** (pending autosave, or edits from another source) — affected blocks are skipped, others still apply. (Test in Task 5.)
4. **The AI drops, empties or duplicates a marker** — those passages count as unchanged and never show as deletions. (Tests in Task 1.)
5. **The rewrite equals the original** (or differs only in trailing whitespace) — no changes, and the modal says "No changes suggested" instead of an empty review. (Tests in Task 3; UI in Task 7.)

---

## File Structure

**Server — create**
- `server/src/services/polishService.js` — pure: `validateTargets`, `targetWords`, `maxTokensFor`, `buildPolishPrompt`, `parseRewrites`.
- `server/test/polishService.test.js`

**Server — modify**
- `server/src/routes/ai.js` — new `/polish-draft` contract.
- `server/src/services/providers/fake.js` — polish branch.

**Client — create**
- `client/src/utils/polishDiff.js` — pure: `sentenceSpans`, `splitSentences`, `diffSentences`, `diffWords`, `buildChanges`.
- `client/src/utils/editorBlocks.js` — DOM-agnostic block model: `getBlocks`, `blockPieces`, `pointToBlockOffset`, `chapterTargets`, `selectionTargets`, `batchTargets`.
- `client/src/utils/applyPolish.js` — `applyPolish`.
- `client/src/components/overlays/PolishReviewModal.jsx`
- `client/test/polishDiff.test.js`, `client/test/editorBlocks.test.js`, `client/test/applyPolish.test.js`

**Client — modify**
- `client/package.json` — `test` script, `linkedom` devDependency.
- `client/src/context/EditorContext.jsx` — `selection` state.
- `client/src/components/editor/Editor.jsx` — selection memory.
- `client/src/utils/api.js` — errors carry `status` and `code`.
- `client/src/hooks/useAI.js` — `NO_API_KEY` check uses `code`.
- `client/src/components/panel/QuillTab.jsx` — Polish button/flow.
- `client/src/index.css` — review modal styles.

**Client — delete**
- `client/src/components/overlays/DraftPolishModal.jsx` (its `.draft-polish-*` CSS classes stay; History and Summary modals use them).

---

### Task 1: Polish prompt, validation and rewrite parsing (server, pure)

**Files:**
- Create: `server/src/services/polishService.js`
- Test: `server/test/polishService.test.js`

**Interfaces:**
- Consumes: `countWords(text)` from `server/src/services/wordCountService.js`; `truncateMiddle(text, maxChars)` from `server/src/services/summaryText.js`.
- Produces:
  - `MAX_TARGET_WORDS = 2000`
  - `validateTargets(targets): null | { code: 'MISSING_FIELD'|'TOO_LONG', message: string }`
  - `targetWords(targets: {text}[]): number`
  - `maxTokensFor(words: number): number`
  - `buildPolishPrompt({ chapterText: string, targets: {id, text}[] }): string` — contains the line `Passages to polish:`.
  - `parseRewrites(raw: string, ids: string[]): { rewrites: {id, text}[], missing: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `server/test/polishService.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_WORDS,
  validateTargets,
  targetWords,
  maxTokensFor,
  buildPolishPrompt,
  parseRewrites,
} from '../src/services/polishService.js';

test('validateTargets accepts well-formed targets', () => {
  assert.equal(validateTargets([{ id: 't1', text: 'One.' }, { id: 't2', text: 'Two.' }]), null);
});

test('validateTargets rejects empty, malformed and duplicate targets', () => {
  for (const bad of [undefined, [], [{ id: 't1', text: '  ' }], [{ id: 't1' }], [{ id: 'bad id', text: 'x' }], [{ id: 't1', text: 'a' }, { id: 't1', text: 'b' }]]) {
    assert.equal(validateTargets(bad)?.code, 'MISSING_FIELD', JSON.stringify(bad));
  }
});

test('validateTargets rejects more than MAX_TARGET_WORDS words', () => {
  const text = Array.from({ length: MAX_TARGET_WORDS + 1 }, () => 'word').join(' ');
  assert.equal(validateTargets([{ id: 't1', text }]).code, 'TOO_LONG');
  assert.equal(validateTargets([{ id: 't1', text: text.split(' ').slice(1).join(' ') }]), null);
});

test('targetWords and maxTokensFor size the output cap', () => {
  assert.equal(targetWords([{ text: 'a b c' }, { text: 'd' }]), 4);
  assert.equal(maxTokensFor(100), 420);
  assert.equal(maxTokensFor(2000), 4600);
  assert.equal(maxTokensFor(10000), 8000);
});

test('buildPolishPrompt marks each target and wraps the chapter', () => {
  const prompt = buildPolishPrompt({
    chapterText: 'Full chapter text.',
    targets: [{ id: 't1', text: 'First passage.' }, { id: 't2', text: 'Second.' }],
  });
  assert.ok(prompt.includes('<chapter>\nFull chapter text.\n</chapter>'));
  assert.ok(prompt.includes('Passages to polish:\n[[t1]]First passage.[[/t1]]\n[[t2]]Second.[[/t2]]'));
  assert.ok(prompt.includes('Rewrite ONLY the passages marked'));
});

test('buildPolishPrompt middle-truncates very long chapters', () => {
  const chapterText = 'A'.repeat(40000) + 'MIDDLE' + 'Z'.repeat(40000);
  const prompt = buildPolishPrompt({ chapterText, targets: [{ id: 't1', text: 'x' }] });
  assert.ok(!prompt.includes('MIDDLE'));
  assert.ok(prompt.includes('[…]'));
});

test('parseRewrites extracts marked passages, keeping inner newlines', () => {
  const raw = 'Sure.\n[[t1]]\nOne, better.\n[[/t1]]\n[[t2]]Line one.\nLine two.[[/t2]]';
  assert.deepEqual(parseRewrites(raw, ['t1', 't2']), {
    rewrites: [
      { id: 't1', text: 'One, better.' },
      { id: 't2', text: 'Line one.\nLine two.' },
    ],
    missing: [],
  });
});

test('parseRewrites reports missing, empty and duplicated passages as missing', () => {
  const raw = '[[t1]]  [[/t1]] [[t2]]a[[/t2]] [[t2]]b[[/t2]] [[t9]]stray[[/t9]] text outside';
  assert.deepEqual(parseRewrites(raw, ['t1', 't2', 't3']), {
    rewrites: [],
    missing: ['t1', 't2', 't3'],
  });
  assert.deepEqual(parseRewrites(undefined, ['t1']), { rewrites: [], missing: ['t1'] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix server test`
Expected: FAIL — `Cannot find module '…/src/services/polishService.js'`.

- [ ] **Step 3: Implement**

Create `server/src/services/polishService.js`:

```js
import { countWords } from './wordCountService.js';
import { truncateMiddle } from './summaryText.js';

export const MAX_TARGET_WORDS = 2000;
const MAX_CHAPTER_CHARS = 60000;
const ID_RE = /^[\w-]+$/;

export function targetWords(targets) {
  return targets.reduce((sum, t) => sum + countWords(t.text), 0);
}

export function validateTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { code: 'MISSING_FIELD', message: 'targets must be a non-empty array' };
  }
  const ids = new Set();
  for (const t of targets) {
    if (!t || typeof t.id !== 'string' || !ID_RE.test(t.id) || typeof t.text !== 'string' || !t.text.trim()) {
      return { code: 'MISSING_FIELD', message: 'each target needs an id and non-blank text' };
    }
    if (ids.has(t.id)) return { code: 'MISSING_FIELD', message: `duplicate target id: ${t.id}` };
    ids.add(t.id);
  }
  const words = targetWords(targets);
  if (words > MAX_TARGET_WORDS) {
    return { code: 'TOO_LONG', message: `Passages total ${words} words; the limit is ${MAX_TARGET_WORDS}` };
  }
  return null;
}

// About 1.5 tokens per word plus headroom, so a full request can't be cut off
export function maxTokensFor(words) {
  return Math.min(8000, Math.ceil((words * 22) / 10) + 200); // integer math: 100 * 2.2 isn't exactly 220
}

export function buildPolishPrompt({ chapterText, targets }) {
  const passages = targets.map((t) => `[[${t.id}]]${t.text}[[/${t.id}]]`).join('\n');
  return `You are polishing passages of a writer's chapter. Improve grammar, fix clumsy sentence structure, and make the prose more expressive and vivid — while keeping the story direction, plot beats, characters, dialogue meaning, and tone exactly as the writer intended.

Rules:
- Rewrite ONLY the passages marked [[id]] … [[/id]] below. The full chapter is given for context; do not rewrite anything else.
- Return every marked passage, each wrapped in the same markers, and nothing else.
- If a passage is already good, return it unchanged.
- Do NOT add new plot events, characters, or scenes. Do NOT change what happens.
- Preserve the writer's voice; fix grammar inside dialogue but keep what characters mean.
- Keep line breaks inside a passage as they are.

<chapter>
${truncateMiddle(chapterText || '', MAX_CHAPTER_CHARS)}
</chapter>

Passages to polish:
${passages}`;
}

// Missing, empty or duplicated passages are reported so the client treats them
// as unchanged rather than deleted
export function parseRewrites(raw, ids) {
  const found = new Map();
  const duplicated = new Set();
  const re = /\[\[([\w-]+)\]\]([\s\S]*?)\[\[\/\1\]\]/g;
  for (const match of (raw || '').matchAll(re)) {
    const [, id, text] = match;
    if (!ids.includes(id)) continue;
    if (found.has(id)) duplicated.add(id);
    found.set(id, text.trim());
  }
  const rewrites = [];
  const missing = [];
  for (const id of ids) {
    const text = found.get(id);
    if (!text || duplicated.has(id)) missing.push(id);
    else rewrites.push({ id, text });
  }
  return { rewrites, missing };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix server test`
Expected: PASS — all tests, including the 8 new ones.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/polishService.js server/test/polishService.test.js
git commit -m "feat: add polish prompt building and marked-rewrite parsing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New `/ai/polish-draft` contract and fake provider

**Files:**
- Modify: `server/src/routes/ai.js` (the `// POST /api/ai/polish-draft` handler)
- Modify: `server/src/services/providers/fake.js`

**Interfaces:**
- Consumes: Task 1 exports; existing `contextFor`, `withContext`, `respond`, `handleLlmError`, `loadWorkFromBody()` in `ai.js`.
- Produces: `POST /api/ai/polish-draft` with body `{ workId, chapterId?, chapterText?, targets: {id, text}[] }` → `{ rewrites: {id, text}[], missing: string[], context? }`; `400 MISSING_FIELD` / `400 TOO_LONG` on bad targets. Fake provider answers polish prompts by returning each marked passage with `very ` → `deeply ` and `walked` → `strode` (first occurrence each).

- [ ] **Step 1: Replace the route**

In `server/src/routes/ai.js`, add the import:

```js
import { validateTargets, targetWords, maxTokensFor, buildPolishPrompt, parseRewrites } from '../services/polishService.js';
```

and replace the whole `// POST /api/ai/polish-draft` handler (from the comment through its closing `});`) with:

```js
// POST /api/ai/polish-draft
// Rewrites only the given target passages; the whole chapter goes along as context
router.post('/polish-draft', loadWorkFromBody(), async (req, res, next) => {
  try {
    const { targets } = req.body;
    const chapterText = typeof req.body.chapterText === 'string' ? req.body.chapterText : '';
    const invalid = validateTargets(targets);
    if (invalid) return next(httpError(400, invalid.code, invalid.message));

    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      targets.map((t) => t.text).join('\n\n')
    );
    const prompt = buildPolishPrompt({ chapterText, targets });

    const raw = await complete({
      system: SYSTEM_PROMPT,
      prompt: withContext(context, prompt),
      maxTokensOverride: maxTokensFor(targetWords(targets)),
      userId: req.user.id,
    });

    const { rewrites, missing } = parseRewrites(raw, targets.map((t) => t.id));
    respond(res, { rewrites, missing }, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});
```

- [ ] **Step 2: Teach the fake provider the polish format**

In `server/src/services/providers/fake.js`, add at the top of `complete()` (before the summary check):

```js
  if (prompt.includes('Passages to polish:')) {
    const section = prompt.slice(prompt.lastIndexOf('Passages to polish:'));
    const passages = [...section.matchAll(/\[\[([\w-]+)\]\]([\s\S]*?)\[\[\/\1\]\]/g)];
    return passages
      .map(([, id, text]) => `[[${id}]]${text.replace('very ', 'deeply ').replace('walked', 'strode')}[[/${id}]]`)
      .join('\n');
  }
```

- [ ] **Step 3: Verify**

Run: `node --check server/src/routes/ai.js && npm --prefix server test`
Expected: no syntax errors; all tests PASS.

Run the fake end to end through the parser:

```bash
cd server && NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake node --input-type=module -e "
import { complete } from './src/services/llmService.js';
import { buildPolishPrompt, parseRewrites } from './src/services/polishService.js';
const prompt = buildPolishPrompt({ chapterText: 'She walked very slowly.', targets: [{ id: 't1', text: 'She walked very slowly.' }, { id: 't2', text: 'Fine.' }] });
console.log(JSON.stringify(parseRewrites(await complete({ prompt }), ['t1', 't2'])));"
```

Expected: `{"rewrites":[{"id":"t1","text":"She strode deeply slowly."},{"id":"t2","text":"Fine."}],"missing":[]}`

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/ai.js server/src/services/providers/fake.js
git commit -m "feat: polish only marked target passages with the whole chapter as context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client test runner and the sentence diff engine

**Files:**
- Modify: `client/package.json`
- Create: `client/src/utils/polishDiff.js`
- Test: `client/test/polishDiff.test.js`

**Interfaces:**
- Produces:
  - `sentenceSpans(text): { text, start, end }[]` — contiguous, covers `text` exactly.
  - `splitSentences(text): string[]` — `splitSentences(t).join('') === t`.
  - `diffSentences(original, rewrite): ({ type: 'equal', text, start, end } | { type: 'change', fromText, toText, start, end })[]` — offsets into `original`.
  - `diffWords(fromText, toText): { type: 'same'|'del'|'add', text }[]` — adjacent same-type ops merged.
  - `buildChanges(targets, rewrites): { segmentsByTarget: Record<targetId, ({type:'equal', text} | {type:'change', changeId})[]>, changes: Change[] }` where `Change = { id, targetId, blockIndex, start, end, fromText, toText, status: 'pending' }`, `id = \`${targetId}-c${n}\``, and `start`/`end` are **block** offsets (`target.start + segment offset`). Targets need `{ id, blockIndex, start, text }`.

- [ ] **Step 1: Add the test script and dev dependency**

Run: `npm --prefix client install -D linkedom@0.18.13`

Then in `client/package.json` add to `"scripts"`:

```json
    "test": "node --test \"test/**/*.test.js\""
```

- [ ] **Step 2: Write the failing tests**

Create `client/test/polishDiff.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceSpans, splitSentences, diffSentences, diffWords, buildChanges } from '../src/utils/polishDiff.js';

test('splitSentences round-trips and keeps trailing whitespace on each piece', () => {
  const text = 'One. Two!  Three?\nFour… "Five," she said. (Six.) Seven';
  const pieces = splitSentences(text);
  assert.equal(pieces.join(''), text);
  assert.deepEqual(pieces, ['One. ', 'Two!  ', 'Three?\n', 'Four… ', '"Five," she said. ', '(Six.) ', 'Seven']);
});

test('splitSentences does not split after common abbreviations', () => {
  assert.deepEqual(splitSentences('Mr. Vell met Dr. Ash. They left.'), ['Mr. Vell met Dr. Ash. ', 'They left.']);
});

test('splitSentences splits dialogue that ends inside quotes', () => {
  assert.deepEqual(splitSentences('"Run!" She ran.'), ['"Run!" ', 'She ran.']);
});

test('splitSentences treats a line break as a boundary', () => {
  assert.deepEqual(splitSentences('Line one\nLine two'), ['Line one\n', 'Line two']);
  assert.deepEqual(splitSentences(''), []);
});

test('sentenceSpans gives offsets into the text', () => {
  assert.deepEqual(sentenceSpans('Ab. Cd.'), [
    { text: 'Ab. ', start: 0, end: 4 },
    { text: 'Cd.', start: 4, end: 7 },
  ]);
});

test('diffSentences finds a single changed sentence', () => {
  const segs = diffSentences('One. Two. Three.', 'One. Two, better. Three.');
  assert.deepEqual(segs, [
    { type: 'equal', text: 'One. ', start: 0, end: 5 },
    { type: 'change', fromText: 'Two. ', toText: 'Two, better. ', start: 5, end: 10 },
    { type: 'equal', text: 'Three.', start: 10, end: 16 },
  ]);
});

test('diffSentences merges a split sentence into one change', () => {
  const segs = diffSentences('A long one, then more. End.', 'A long one. Then more. End.');
  assert.deepEqual(segs.filter((s) => s.type === 'change'), [
    { type: 'change', fromText: 'A long one, then more. ', toText: 'A long one. Then more. ', start: 0, end: 23 },
  ]);
});

test('diffSentences handles deletion and insertion at the end', () => {
  assert.deepEqual(diffSentences('A. B.', 'A.').filter((s) => s.type === 'change'), [
    { type: 'change', fromText: 'B.', toText: '', start: 3, end: 5 },
  ]);
  assert.deepEqual(diffSentences('A.', 'A. B.').filter((s) => s.type === 'change'), [
    { type: 'change', fromText: '', toText: ' B.', start: 2, end: 2 },
  ]);
});

test('diffSentences treats trailing-whitespace-only differences as equal', () => {
  assert.ok(diffSentences('A. B.', 'A.  B.').every((s) => s.type === 'equal'));
  assert.ok(diffSentences('Same.', 'Same.').every((s) => s.type === 'equal'));
});

test('diffWords marks word-level edits and merges runs', () => {
  assert.deepEqual(diffWords('She walked very slowly.', 'She strode slowly.'), [
    { type: 'same', text: 'She ' },
    { type: 'del', text: 'walked very' },
    { type: 'add', text: 'strode' },
    { type: 'same', text: ' slowly.' },
  ]);
});

test('buildChanges maps changes to block offsets and leaves unchanged targets as equal text', () => {
  const targets = [
    { id: 't1', blockIndex: 2, start: 10, end: 26, text: 'One. Two. Three.' },
    { id: 't2', blockIndex: 3, start: 0, end: 5, text: 'Same.' },
    { id: 't3', blockIndex: 4, start: 0, end: 4, text: 'Gone' },
  ];
  const { segmentsByTarget, changes } = buildChanges(targets, [
    { id: 't1', text: 'One. Two, better. Three.' },
    { id: 't2', text: 'Same.' },
  ]);
  assert.deepEqual(changes, [
    { id: 't1-c1', targetId: 't1', blockIndex: 2, start: 15, end: 20, fromText: 'Two. ', toText: 'Two, better. ', status: 'pending' },
  ]);
  assert.deepEqual(segmentsByTarget.t1, [
    { type: 'equal', text: 'One. ' },
    { type: 'change', changeId: 't1-c1' },
    { type: 'equal', text: 'Three.' },
  ]);
  assert.deepEqual(segmentsByTarget.t2, [{ type: 'equal', text: 'Same.' }]);
  assert.deepEqual(segmentsByTarget.t3, [{ type: 'equal', text: 'Gone' }]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix client test`
Expected: FAIL — `Cannot find module '…/src/utils/polishDiff.js'`.

- [ ] **Step 4: Implement**

Create `client/src/utils/polishDiff.js`:

```js
// Sentence-level diff for Polish review. Pure; no DOM.

const BOUNDARY = /[.!?…]+["'”’)\]]*\s+|\n\s*/g;
const ABBREVIATIONS = /(?:^|[\s("“])(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Capt|Lt|Col|Gen|Sgt|Mt|vs)$/i;

export function sentenceSpans(text) {
  if (!text) return [];
  const spans = [];
  let last = 0;
  for (const match of text.matchAll(BOUNDARY)) {
    // "Mr. Vell" is one sentence: a lone '.' after a known abbreviation isn't a boundary
    if (match[0].startsWith('.') && /^\.\s/.test(match[0]) && ABBREVIATIONS.test(text.slice(last, match.index))) continue;
    const end = match.index + match[0].length;
    spans.push({ text: text.slice(last, end), start: last, end });
    last = end;
  }
  if (last < text.length) spans.push({ text: text.slice(last), start: last, end: text.length });
  return spans;
}

export function splitSentences(text) {
  return sentenceSpans(text).map((s) => s.text);
}

function lcsTable(a, b, same) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

const sentenceKey = (s) => s.text.trimEnd();

export function diffSentences(original, rewrite) {
  const a = sentenceSpans(original);
  const b = sentenceSpans(rewrite);
  const same = (x, y) => sentenceKey(x) === sentenceKey(y);
  const dp = lcsTable(a, b, same);
  const segments = [];
  let pending = null;

  const flush = () => {
    if (!pending) return;
    const { from, to, at } = pending;
    const start = from.length ? from[0].start : at;
    const end = from.length ? from[from.length - 1].end : start;
    let toText = to.map((s) => s.text).join('');
    // Appending after a final sentence that has no trailing space needs one
    if (!from.length && start === original.length && start > 0 && !/\s$/.test(original) && toText && !/^\s/.test(toText)) {
      toText = ` ${toText}`;
    }
    segments.push({ type: 'change', fromText: original.slice(start, end), toText, start, end });
    pending = null;
  };
  const open = (i) => (pending ??= { from: [], to: [], at: i < a.length ? a[i].start : original.length });

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i], b[j])) {
      flush();
      segments.push({ type: 'equal', text: a[i].text, start: a[i].start, end: a[i].end });
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      open(i).to.push(b[j]);
      j += 1;
    } else {
      open(i).from.push(a[i]);
      i += 1;
    }
  }
  flush();
  return segments;
}

const TOKEN = /\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu;

export function diffWords(fromText, toText) {
  const a = fromText.match(TOKEN) || [];
  const b = toText.match(TOKEN) || [];
  const dp = lcsTable(a, b, (x, y) => x === y);
  const raw = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      raw.push({ type: 'add', text: b[j] });
      j += 1;
    } else {
      raw.push({ type: 'del', text: a[i] });
      i += 1;
    }
  }

  // Group each run of edits as one deletion then one addition. A lone
  // whitespace match between two edits belongs to the edit ("walked very" →
  // "strode", not "walked" + " " + "very"), and whitespace both sides end
  // with stays outside it.
  const ops = [];
  const pushSame = (text) => {
    const last = ops[ops.length - 1];
    if (last && last.type === 'same') last.text += text;
    else if (text) ops.push({ type: 'same', text });
  };
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === 'same') {
      pushSame(raw[k].text);
      k += 1;
      continue;
    }
    let del = '';
    let add = '';
    while (k < raw.length) {
      const op = raw[k];
      const bridge = op.type === 'same' && /^\s+$/.test(op.text) && raw[k + 1] && raw[k + 1].type !== 'same';
      if (op.type === 'del') del += op.text;
      else if (op.type === 'add') add += op.text;
      else if (bridge) {
        del += op.text;
        add += op.text;
      } else break;
      k += 1;
    }
    const shared = (del.match(/\s*$/)[0].length && add.endsWith(del.match(/\s*$/)[0])) ? del.match(/\s*$/)[0] : '';
    if (shared) {
      del = del.slice(0, -shared.length);
      add = add.slice(0, -shared.length);
    }
    if (del) ops.push({ type: 'del', text: del });
    if (add) ops.push({ type: 'add', text: add });
    if (shared) pushSame(shared);
  }
  return ops;
}

export function buildChanges(targets, rewrites) {
  const byId = new Map(rewrites.map((r) => [r.id, r.text]));
  const segmentsByTarget = {};
  const changes = [];
  for (const target of targets) {
    const rewrite = byId.get(target.id);
    if (rewrite === undefined || rewrite === target.text) {
      segmentsByTarget[target.id] = [{ type: 'equal', text: target.text }];
      continue;
    }
    let n = 0;
    segmentsByTarget[target.id] = diffSentences(target.text, rewrite).map((seg) => {
      if (seg.type === 'equal') return { type: 'equal', text: seg.text };
      n += 1;
      const id = `${target.id}-c${n}`;
      changes.push({
        id,
        targetId: target.id,
        blockIndex: target.blockIndex,
        start: target.start + seg.start,
        end: target.start + seg.end,
        fromText: seg.fromText,
        toText: seg.toText,
        status: 'pending',
      });
      return { type: 'change', changeId: id };
    });
  }
  return { segmentsByTarget, changes };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix client test`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/src/utils/polishDiff.js client/test/polishDiff.test.js
git commit -m "feat: add sentence-level diff engine for Polish review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Editor blocks, offsets and targets

**Files:**
- Create: `client/src/utils/editorBlocks.js`
- Test: `client/test/editorBlocks.test.js`

**Interfaces:**
- Consumes: `sentenceSpans` (Task 3); `countWords` from `client/src/utils/wordCount.js`.
- Produces:
  - `getBlocks(root): Block[]`, `Block = { index, nodes: Node[], text: string }`
  - `blockPieces(nodes): { pieces: Piece[], text: string }`, `Piece = { kind: 'text'|'break'|'virtual', node, start, end }` (`break` = `<br>`, `virtual` = a nested block element's leading line break)
  - `pointToBlockOffset(root, blocks, container, offset): { blockIndex, offset } | null`
  - `chapterTargets(blocks): Target[]` and `selectionTargets(blocks, selection): Target[]`, `Target = { blockIndex, start, end, text }` (trimmed ranges, no `id`)
  - `batchTargets(targets, maxWords = 1500): Target[][]` — splits targets over `maxWords` at sentence boundaries, assigns ids `t1…tn` in order, groups into batches of ≤ `maxWords` words.
  - `selection = { start: { blockIndex, offset }, end: { blockIndex, offset } }`

- [ ] **Step 1: Write the failing tests**

Create `client/test/editorBlocks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  getBlocks,
  blockPieces,
  pointToBlockOffset,
  chapterTargets,
  selectionTargets,
  batchTargets,
} from '../src/utils/editorBlocks.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

test('getBlocks treats a bare first line and each top-level div as blocks', () => {
  const root = editor('First <b>bold</b> line.<div>Second.</div><div><br></div><p>Third.</p>');
  assert.deepEqual(getBlocks(root).map((b) => b.text), ['First bold line.', 'Second.', '\n', 'Third.']);
});

test('blockPieces counts <br> and nested blocks as line breaks', () => {
  const root = editor('<div>One.<br>Two.<div>Nested.</div></div>');
  const { text, pieces } = blockPieces(getBlocks(root)[0].nodes);
  assert.equal(text, 'One.\nTwo.\nNested.');
  assert.deepEqual(pieces.map((p) => [p.kind, p.start, p.end]), [
    ['text', 0, 4],
    ['break', 4, 5],
    ['text', 5, 9],
    ['virtual', 9, 10],
    ['text', 10, 17],
  ]);
});

test('pointToBlockOffset maps text, element and root positions', () => {
  const root = editor('Intro <b>bold</b>.<div>Second <i>it</i>.</div>');
  const blocks = getBlocks(root);
  const bold = root.querySelector('b').firstChild;
  assert.deepEqual(pointToBlockOffset(root, blocks, bold, 2), { blockIndex: 0, offset: 8 });
  const div = root.querySelector('div');
  assert.deepEqual(pointToBlockOffset(root, blocks, div, 1), { blockIndex: 1, offset: 7 });
  assert.deepEqual(pointToBlockOffset(root, blocks, div, 3), { blockIndex: 1, offset: 10 });
  assert.deepEqual(pointToBlockOffset(root, blocks, root, root.childNodes.length), { blockIndex: 1, offset: 10 });
});

test('chapterTargets makes one trimmed target per non-blank block', () => {
  const root = editor('  Hello there.  <div><br></div><div>Next.</div>');
  assert.deepEqual(chapterTargets(getBlocks(root)), [
    { blockIndex: 0, start: 2, end: 14, text: 'Hello there.' },
    { blockIndex: 2, start: 0, end: 5, text: 'Next.' },
  ]);
});

test('selectionTargets expands a partial selection to whole sentences', () => {
  const root = editor('<div>One here. Two there. Three.</div>');
  const blocks = getBlocks(root);
  // selects "wo th" inside the second sentence
  const sel = { start: { blockIndex: 0, offset: 11 }, end: { blockIndex: 0, offset: 16 } };
  assert.deepEqual(selectionTargets(blocks, sel), [{ blockIndex: 0, start: 10, end: 20, text: 'Two there.' }]);
});

test('selectionTargets spans several blocks and skips blank ones', () => {
  const root = editor('<div>A one. A two.</div><div><br></div><div>B one. B two.</div>');
  const blocks = getBlocks(root);
  const sel = { start: { blockIndex: 0, offset: 9 }, end: { blockIndex: 2, offset: 3 } };
  assert.deepEqual(selectionTargets(blocks, sel), [
    { blockIndex: 0, start: 7, end: 13, text: 'A two.' },
    { blockIndex: 2, start: 0, end: 6, text: 'B one.' },
  ]);
});

test('batchTargets assigns ids and groups by word budget', () => {
  const t = (blockIndex, words) => {
    const text = Array.from({ length: words }, (_, i) => `w${i}.`).join(' ');
    return { blockIndex, start: 0, end: text.length, text };
  };
  const batches = batchTargets([t(0, 600), t(1, 600), t(2, 600)], 1500);
  assert.deepEqual(batches.map((b) => b.map((x) => x.id)), [['t1', 't2'], ['t3']]);
});

test('batchTargets splits an over-long target at sentence boundaries', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} here.`).join(' ');
  const [target] = chapterTargets(getBlocks(editor(`<div>${text}</div>`)));
  const batches = batchTargets([target], 50);
  const parts = batches.flat();
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.text.split(/\s+/).length <= 50));
  assert.equal(parts.map((p) => text.slice(p.start, p.end)).join(' '), text);
  assert.deepEqual(parts.map((p) => p.id), parts.map((_, i) => `t${i + 1}`));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix client test`
Expected: FAIL — `Cannot find module '…/src/utils/editorBlocks.js'`.

- [ ] **Step 3: Implement**

Create `client/src/utils/editorBlocks.js`:

```js
// Maps the contentEditable DOM to "blocks" (paragraph lines) with plain-text
// offsets, the coordinate system Polish targets and changes use.
import { sentenceSpans } from './polishDiff.js';
import { countWords } from './wordCount.js';

const ELEMENT = 1;
const TEXT = 3;
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

const isBlockElement = (node) => node.nodeType === ELEMENT && BLOCK_TAGS.has(node.tagName);
const holds = (node, other) => node === other || (node.nodeType === ELEMENT && node.contains(other));

export function blockPieces(nodes) {
  const pieces = [];
  let text = '';
  const walk = (node) => {
    if (node.nodeType === TEXT) {
      pieces.push({ kind: 'text', node, start: text.length, end: text.length + node.data.length });
      text += node.data;
      return;
    }
    if (node.nodeType !== ELEMENT) return;
    if (node.tagName === 'BR') {
      pieces.push({ kind: 'break', node, start: text.length, end: text.length + 1 });
      text += '\n';
      return;
    }
    // A pasted nested <div> starts a new line inside this block
    if (isBlockElement(node) && text && !text.endsWith('\n')) {
      pieces.push({ kind: 'virtual', node, start: text.length, end: text.length + 1 });
      text += '\n';
    }
    for (const child of [...node.childNodes]) walk(child);
  };
  for (const node of nodes) walk(node);
  return { pieces, text };
}

// Chrome leaves the first line as bare inline nodes before the first <div>
export function getBlocks(root) {
  const groups = [];
  let run = null;
  for (const node of [...root.childNodes]) {
    if (isBlockElement(node)) {
      run = null;
      groups.push([node]);
    } else {
      if (!run) {
        run = [];
        groups.push(run);
      }
      run.push(node);
    }
  }
  return groups.map((nodes, index) => ({ index, nodes, text: blockPieces(nodes).text }));
}

export function pointToBlockOffset(root, blocks, container, offset) {
  if (container === root) {
    const child = root.childNodes[offset];
    if (!child) {
      const last = blocks[blocks.length - 1];
      return last ? { blockIndex: last.index, offset: last.text.length } : null;
    }
    const block = blocks.find((b) => b.nodes.includes(child));
    return block ? { blockIndex: block.index, offset: 0 } : null;
  }

  const block = blocks.find((b) => b.nodes.some((n) => holds(n, container)));
  if (!block) return null;
  const { pieces } = blockPieces(block.nodes);

  if (container.nodeType === TEXT) {
    const piece = pieces.find((p) => p.node === container);
    return piece ? { blockIndex: block.index, offset: piece.start + offset } : null;
  }

  const child = container.childNodes[offset];
  if (child) {
    const piece = pieces.find((p) => holds(child, p.node));
    if (piece) return { blockIndex: block.index, offset: piece.start };
  }
  const inside = pieces.filter((p) => holds(container, p.node));
  if (inside.length) return { blockIndex: block.index, offset: inside[inside.length - 1].end };
  return { blockIndex: block.index, offset: 0 };
}

function trimmedTarget(blockIndex, text, start, end) {
  const slice = text.slice(start, end);
  const s = start + (slice.length - slice.trimStart().length);
  const e = start + slice.trimEnd().length;
  if (e <= s) return null;
  return { blockIndex, start: s, end: e, text: text.slice(s, e) };
}

export function chapterTargets(blocks) {
  return blocks.map((b) => trimmedTarget(b.index, b.text, 0, b.text.length)).filter(Boolean);
}

export function selectionTargets(blocks, selection) {
  const targets = [];
  for (let i = selection.start.blockIndex; i <= selection.end.blockIndex; i++) {
    const block = blocks[i];
    if (!block) continue;
    const s0 = i === selection.start.blockIndex ? selection.start.offset : 0;
    const e0 = i === selection.end.blockIndex ? selection.end.offset : block.text.length;
    if (e0 <= s0 || !block.text.slice(s0, e0).trim()) continue;
    const spans = sentenceSpans(block.text);
    const first = spans.find((sp) => s0 < sp.end);
    const last = [...spans].reverse().find((sp) => e0 > sp.start);
    const target = first && last ? trimmedTarget(i, block.text, first.start, last.end) : null;
    if (target) targets.push(target);
  }
  return targets;
}

function splitLongTarget(target, maxWords) {
  if (countWords(target.text) <= maxWords) return [target];
  const parts = [];
  let current = null;
  for (const span of sentenceSpans(target.text)) {
    const words = countWords(span.text);
    if (current && current.words + words > maxWords) {
      parts.push(current);
      current = null;
    }
    current ??= { start: span.start, end: span.start, words: 0 };
    current.end = span.end;
    current.words += words;
  }
  if (current) parts.push(current);
  return parts
    .map((p) => trimmedTarget(target.blockIndex, target.text, p.start, p.end))
    .filter(Boolean)
    .map((p) => ({ ...p, start: target.start + p.start, end: target.start + p.end }));
}

export function batchTargets(targets, maxWords = 1500) {
  const split = targets.flatMap((t) => splitLongTarget(t, maxWords));
  const batches = [];
  let current = [];
  let words = 0;
  split.forEach((t, i) => {
    const w = countWords(t.text);
    if (current.length && words + w > maxWords) {
      batches.push(current);
      current = [];
      words = 0;
    }
    current.push({ ...t, id: `t${i + 1}` });
    words += w;
  });
  if (current.length) batches.push(current);
  return batches;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix client test`
Expected: PASS — all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/editorBlocks.js client/test/editorBlocks.test.js
git commit -m "feat: map editor DOM to blocks, offsets and Polish targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Apply accepted changes to the editor DOM

**Files:**
- Create: `client/src/utils/applyPolish.js`
- Test: `client/test/applyPolish.test.js`

**Interfaces:**
- Consumes: `getBlocks`, `blockPieces` (Task 4); `Change` objects from `buildChanges` (Task 3).
- Produces: `applyPolish(root, changes, originalBlockTexts: string[]): { applied: number, skipped: number }` — applies only `status === 'accepted'`, mutates `root` in place.

- [ ] **Step 1: Write the failing tests**

Create `client/test/applyPolish.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { getBlocks } from '../src/utils/editorBlocks.js';
import { applyPolish } from '../src/utils/applyPolish.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

// Builds an accepted change replacing `from` (first occurrence) in block `blockIndex`
function change(root, blockIndex, from, toText, status = 'accepted') {
  const text = getBlocks(root)[blockIndex].text;
  const start = text.indexOf(from);
  assert.ok(start >= 0, `"${from}" not in block ${blockIndex}`);
  return { id: `${blockIndex}-${start}`, blockIndex, start, end: start + from.length, fromText: from, toText, status };
}

const texts = (root) => getBlocks(root).map((b) => b.text);

test('keeps formatting outside the changed sentence', () => {
  const root = editor('<div>Keep <b>bold</b> here. She walked very slowly. <i>End</i> part.</div>');
  const before = texts(root);
  const result = applyPolish(root, [change(root, 0, 'She walked very slowly. ', 'She strode slowly. ')], before);
  assert.deepEqual(result, { applied: 1, skipped: 0 });
  assert.equal(root.innerHTML, '<div>Keep <b>bold</b> here. She strode slowly. <i>End</i> part.</div>');
});

test('applies several changes in one block from last to first', () => {
  const root = editor('<div>One. Two. Three.</div>');
  const before = texts(root);
  const changes = [change(root, 0, 'One. ', 'Uno. '), change(root, 0, 'Three.', 'Tres.')];
  applyPolish(root, changes, before);
  assert.equal(texts(root)[0], 'Uno. Two. Tres.');
});

test('replaces a range that crosses inline element boundaries and drops emptied elements', () => {
  const root = editor('<div>Start <b>mid dle</b> end. Tail.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Start mid dle end. ', 'Fresh start. ')], before);
  assert.equal(texts(root)[0], 'Fresh start. Tail.');
  assert.ok(!root.innerHTML.includes('<b></b>'));
});

test('keeps <br> line breaks and turns newlines in the rewrite into <br>', () => {
  const root = editor('<div>Line one.<br>Line two.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Line two.', 'Line 2a.\nLine 2b.')], before);
  assert.equal(root.innerHTML, '<div>Line one.<br>Line 2a.<br>Line 2b.</div>');
});

test('handles the bare first line before the first div', () => {
  const root = editor('Opening line. Second.<div>Next block.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Opening line. ', 'An opening. '), change(root, 1, 'Next block.', 'The next block.')], before);
  assert.deepEqual(texts(root), ['An opening. Second.', 'The next block.']);
});

test('only applies accepted changes', () => {
  const root = editor('<div>One. Two.</div>');
  const before = texts(root);
  const result = applyPolish(root, [change(root, 0, 'One. ', 'X. ', 'rejected'), change(root, 0, 'Two.', 'Y.', 'pending')], before);
  assert.deepEqual(result, { applied: 0, skipped: 0 });
  assert.equal(texts(root)[0], 'One. Two.');
});

test('skips changes in a block whose text changed since polishing started', () => {
  const root = editor('<div>One. Two.</div><div>Three.</div>');
  const before = texts(root);
  const changes = [change(root, 0, 'Two.', 'Deux.'), change(root, 1, 'Three.', 'Trois.')];
  root.querySelector('div').firstChild.data = 'One. Two. Typed more.';
  assert.deepEqual(applyPolish(root, changes, before), { applied: 1, skipped: 1 });
  assert.deepEqual(texts(root), ['One. Two. Typed more.', 'Trois.']);
});

test('applies a pure insertion at the end of a block', () => {
  const root = editor('<div>One.</div>');
  const before = texts(root);
  applyPolish(root, [{ id: 'x', blockIndex: 0, start: 4, end: 4, fromText: '', toText: ' Added.', status: 'accepted' }], before);
  assert.equal(texts(root)[0], 'One. Added.');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix client test`
Expected: FAIL — `Cannot find module '…/src/utils/applyPolish.js'`.

- [ ] **Step 3: Implement**

Create `client/src/utils/applyPolish.js`:

```js
// Writes accepted Polish changes into the live editor DOM by text offset, so
// formatting outside each changed range is untouched.
import { getBlocks, blockPieces } from './editorBlocks.js';

const ELEMENT = 1;
const CLEANUP_TAGS = new Set(['B', 'I', 'U', 'EM', 'STRONG', 'SPAN', 'FONT']);

function insertNodes(doc, parent, before, text) {
  text.split('\n').forEach((line, i) => {
    if (i > 0) parent.insertBefore(doc.createElement('br'), before);
    if (line) parent.insertBefore(doc.createTextNode(line), before);
  });
}

function insertAt(block, offset, text) {
  const doc = block.nodes[0].ownerDocument;
  const { pieces } = blockPieces(block.nodes);
  const textPiece = pieces.find((p) => p.kind === 'text' && p.start <= offset && offset <= p.end);
  if (textPiece) {
    const node = textPiece.node;
    const at = offset - textPiece.start;
    const tail = node.data.slice(at);
    const lines = text.split('\n');
    node.data = node.data.slice(0, at) + lines[0];
    let last = node;
    for (const line of lines.slice(1)) {
      const br = doc.createElement('br');
      const next = doc.createTextNode(line);
      last.parentNode.insertBefore(br, last.nextSibling);
      br.parentNode.insertBefore(next, br.nextSibling);
      last = next;
    }
    last.data += tail;
    return;
  }

  const edge = pieces.find((p) => p.start === offset || p.end === offset);
  if (edge) {
    if (edge.kind === 'virtual' && edge.end === offset) {
      insertNodes(doc, edge.node, edge.node.firstChild, text);
    } else {
      const before = edge.start === offset ? edge.node : edge.node.nextSibling;
      insertNodes(doc, edge.node.parentNode, before, text);
    }
    return;
  }

  const first = block.nodes[0];
  if (first.nodeType === ELEMENT && block.nodes.length === 1) insertNodes(doc, first, null, text);
  else insertNodes(doc, first.parentNode, block.nodes[block.nodes.length - 1].nextSibling, text);
}

function replaceRange(block, start, end, toText) {
  const { pieces } = blockPieces(block.nodes);
  for (const p of pieces) {
    const s = Math.max(start, p.start);
    const e = Math.min(end, p.end);
    if (e <= s) continue;
    if (p.kind === 'text') p.node.data = p.node.data.slice(0, s - p.start) + p.node.data.slice(e - p.start);
    else if (p.kind === 'break') p.node.remove();
  }
  block.nodes = block.nodes.filter((n) => n.parentNode);
  if (toText) insertAt(block, start, toText);
}

function removeEmptyInlines(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType !== ELEMENT) continue;
    removeEmptyInlines(child);
    if (CLEANUP_TAGS.has(child.tagName) && child.textContent === '' && !child.querySelector('br')) child.remove();
  }
}

export function applyPolish(root, changes, originalBlockTexts) {
  const byBlock = new Map();
  for (const c of changes) {
    if (c.status !== 'accepted') continue;
    if (!byBlock.has(c.blockIndex)) byBlock.set(c.blockIndex, []);
    byBlock.get(c.blockIndex).push(c);
  }

  const blocks = getBlocks(root);
  let applied = 0;
  let skipped = 0;
  for (const [index, list] of byBlock) {
    const block = blocks[index];
    if (!block || block.text !== originalBlockTexts[index]) {
      skipped += list.length;
      continue;
    }
    // Last first, so earlier offsets stay valid
    list.sort((a, b) => b.start - a.start);
    for (const c of list) {
      replaceRange(block, c.start, c.end, c.toText);
      applied += 1;
    }
    for (const node of block.nodes) {
      if (node.nodeType === ELEMENT) removeEmptyInlines(node);
    }
    if (block.nodes.length > 1 || block.nodes[0]?.nodeType !== ELEMENT) removeEmptyInlines(root);
  }
  return { applied, skipped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix client test`
Expected: PASS — all client tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/applyPolish.js client/test/applyPolish.test.js
git commit -m "feat: apply accepted Polish changes to the editor without losing formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Selection memory and error codes on API errors

**Files:**
- Modify: `client/src/context/EditorContext.jsx`
- Modify: `client/src/components/editor/Editor.jsx`
- Modify: `client/src/utils/api.js`
- Modify: `client/src/hooks/useAI.js`

**Interfaces:**
- Consumes: `getBlocks`, `pointToBlockOffset` (Task 4).
- Produces:
  - `useEditor().state.selection: { start: {blockIndex, offset}, end: {blockIndex, offset} } | null` and `useEditor().setSelection(sel | null)`; cleared on `LOAD_CONTENT`.
  - Errors thrown by `apiFetch` / `api.download` carry `err.status` (HTTP status) and `err.code` (server error code, e.g. `'NO_API_KEY'`).

- [ ] **Step 1: Selection state**

In `client/src/context/EditorContext.jsx`:

- Add to `initialState`: `selection: null, // last non-empty selection inside the editor, as block offsets`
- Add reducer case:

```js
    case 'SET_SELECTION':
      if (JSON.stringify(state.selection) === JSON.stringify(action.selection)) return state;
      return { ...state, selection: action.selection };
```

- In `LOAD_CONTENT`, add `selection: null,` to the returned object.
- Add the action creator and expose it:

```js
  const setSelection = useCallback((selection) => {
    dispatch({ type: 'SET_SELECTION', selection });
  }, []);
```

and add `setSelection` to the provider `value`.

- [ ] **Step 2: Track the selection in the editor**

In `client/src/components/editor/Editor.jsx`:

- Add `import { getBlocks, pointToBlockOffset } from '../../utils/editorBlocks.js';`
- Change `const { state, setContent, clearReplacement } = useEditor();` to `const { state, setContent, clearReplacement, setSelection } = useEditor();`
- Add this effect after the autosave call:

```jsx
  // Remember the last selection made inside the editor: clicking a button in
  // the side panel can take the selection away before Polish reads it
  useEffect(() => {
    function handleSelectionChange() {
      const root = editorRef.current;
      const sel = document.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      if (range.collapsed) {
        setSelection(null);
        return;
      }
      const blocks = getBlocks(root);
      const start = pointToBlockOffset(root, blocks, range.startContainer, range.startOffset);
      const end = pointToBlockOffset(root, blocks, range.endContainer, range.endOffset);
      setSelection(start && end ? { start, end } : null);
    }
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [setSelection]);
```

- [ ] **Step 3: Error status and code**

In `client/src/utils/api.js`, add below `errorMessage`:

```js
function apiError(res, err) {
  const error = new Error(errorMessage(res, err));
  error.status = res.status;
  error.code = err.code;
  return error;
}
```

and replace both `throw new Error(errorMessage(res, err));` lines with `throw apiError(res, err);`.

In `client/src/hooks/useAI.js`, change `err.message === 'NO_API_KEY'` to `err.code === 'NO_API_KEY'`.

- [ ] **Step 4: Build and commit**

Run: `npm --prefix client run build && npm --prefix client test`
Expected: `✓ built`; client tests PASS.

```bash
git add client/src/context/EditorContext.jsx client/src/components/editor/Editor.jsx client/src/utils/api.js client/src/hooks/useAI.js
git commit -m "feat: remember the editor selection and expose API error codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Polish review modal and Quill wiring

**Files:**
- Create: `client/src/components/overlays/PolishReviewModal.jsx`
- Modify: `client/src/components/panel/QuillTab.jsx`
- Modify: `client/src/index.css`
- Delete: `client/src/components/overlays/DraftPolishModal.jsx`

**Interfaces:**
- Consumes: `getBlocks`, `chapterTargets`, `selectionTargets`, `batchTargets` (Task 4); `buildChanges`, `diffWords` (Task 3); `applyPolish` (Task 5); `state.selection` (Task 6); `POST /ai/polish-draft` (Task 2); `summaryRefreshPending` from `client/src/utils/summaryStatus.js`; `ContextUsed`.
- Produces: `<PolishReviewModal workId chapterId session summariesPending onClose />` with `session = { mode: 'chapter'|'selection', batches: Target[][], blockTexts: string[], chapterText: string }`; `onClose(result | null)` where `result = { applied, skipped }`.

- [ ] **Step 1: The review modal**

Create `client/src/components/overlays/PolishReviewModal.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { buildChanges, diffWords } from '../../utils/polishDiff.js';
import { applyPolish } from '../../utils/applyPolish.js';
import ContextUsed from '../panel/ContextUsed.jsx';

const isFatal = (err) => err.code === 'NO_API_KEY' || [401, 403, 404].includes(err.status);

function ChangeView({ change, onSet }) {
  const { status, fromText, toText } = change;
  let body;
  if (status === 'accepted') body = <span className="polish-add">{toText}</span>;
  else if (status === 'rejected') body = <span className="polish-rejected">{fromText}</span>;
  else {
    body = diffWords(fromText, toText).map((op, i) =>
      op.type === 'same' ? (
        <span key={i}>{op.text}</span>
      ) : (
        <span key={i} className={op.type === 'del' ? 'polish-del' : 'polish-add'}>{op.text}</span>
      )
    );
  }
  return (
    <span className={`polish-change polish-change--${status}`}>
      {body}
      <span className="polish-change-actions">
        <button
          className={`polish-change-btn${status === 'accepted' ? ' active' : ''}`}
          onClick={() => onSet(change.id, 'accepted')}
          title="Accept this change"
        >
          ✓
        </button>
        <button
          className={`polish-change-btn${status === 'rejected' ? ' active' : ''}`}
          onClick={() => onSet(change.id, 'rejected')}
          title="Keep the original"
        >
          ✕
        </button>
      </span>
    </span>
  );
}

export default function PolishReviewModal({ workId, chapterId, session, summariesPending, onClose }) {
  const { setContent } = useEditor();
  const { refreshChapters } = useActiveWork();
  const [parts, setParts] = useState(() => session.batches.map(() => ({ status: 'pending', error: null })));
  const [segments, setSegments] = useState({});
  const [changes, setChanges] = useState({});
  const [missing, setMissing] = useState([]);
  const [context, setContext] = useState(null);
  const [fatal, setFatal] = useState(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const setPart = (i, part) => setParts((ps) => ps.map((p, k) => (k === i ? part : p)));

  async function runPart(i) {
    setPart(i, { status: 'running', error: null });
    const targets = session.batches[i];
    try {
      const data = await api.post('/ai/polish-draft', {
        workId,
        chapterId,
        chapterText: session.chapterText,
        targets: targets.map((t) => ({ id: t.id, text: t.text })),
      });
      if (!alive.current) return 'stopped';
      const built = buildChanges(targets, data.rewrites || []);
      setSegments((s) => ({ ...s, ...built.segmentsByTarget }));
      setChanges((c) => ({ ...c, ...Object.fromEntries(built.changes.map((ch) => [ch.id, ch])) }));
      setMissing((m) => [...m, ...(data.missing || [])]);
      if (data.context) setContext((c) => c || data.context);
      setPart(i, { status: 'done', error: null });
      return 'done';
    } catch (err) {
      if (!alive.current) return 'stopped';
      setPart(i, { status: 'failed', error: err.message });
      if (isFatal(err)) {
        setFatal(err.code === 'NO_API_KEY' ? 'No API key configured. Please go to Settings to add your API key.' : err.message);
        return 'fatal';
      }
      return 'failed';
    }
  }

  useEffect(() => {
    (async () => {
      for (let i = 0; i < session.batches.length; i++) {
        const outcome = await runPart(i);
        if (outcome === 'stopped' || outcome === 'fatal') return;
      }
      // The first part may have made chapter summaries
      if (alive.current) refreshChapters(workId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = Object.values(changes);
  const accepted = list.filter((c) => c.status === 'accepted').length;
  const rejected = list.filter((c) => c.status === 'rejected').length;
  const runningIndex = parts.findIndex((p) => p.status === 'running');
  const busy = parts.some((p) => p.status === 'running' || (p.status === 'pending' && !fatal));
  const allDone = parts.every((p) => p.status === 'done');

  const setStatus = (id, status) => setChanges((c) => ({ ...c, [id]: { ...c[id], status } }));
  const setAll = (status) => setChanges((c) => Object.fromEntries(Object.entries(c).map(([id, ch]) => [id, { ...ch, status }])));

  // Consecutive targets in the same block render as one paragraph
  const paragraphs = useMemo(() => {
    const groups = [];
    for (const target of session.batches.flat()) {
      const last = groups[groups.length - 1];
      if (last && last.blockIndex === target.blockIndex) last.targets.push(target);
      else groups.push({ blockIndex: target.blockIndex, targets: [target] });
    }
    return groups;
  }, [session]);

  function handleApply() {
    const editorEl = document.querySelector('.editor');
    if (!editorEl) return;
    const result = applyPolish(editorEl, list, session.blockTexts);
    setContent(editorEl.innerText || '', editorEl.innerHTML);
    onClose(result);
  }

  let status;
  if (fatal) status = fatal;
  else if (runningIndex >= 0) {
    status = `Polishing part ${runningIndex + 1} of ${parts.length}…${runningIndex === 0 && summariesPending ? ' (updating chapter summaries)' : ''}`;
  } else if (allDone && list.length === 0) status = 'No changes suggested.';
  else status = `${list.length} change${list.length === 1 ? '' : 's'} · ${accepted} accepted · ${rejected} rejected`;

  return (
    <div className="modal-backdrop draft-polish-backdrop">
      <div className="modal polish-review-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Polish {session.mode === 'selection' ? 'selection' : 'chapter'}</h2>
            <p className="draft-polish-subtitle">Accept the changes you want. Nothing in your chapter changes until you apply.</p>
          </div>
          <button className="modal-close" onClick={() => onClose(null)}>✕</button>
        </div>

        <div className="polish-review-toolbar">
          <span className={`polish-review-status${fatal ? ' polish-review-status--error' : ''}`}>{status}</span>
          <span className="polish-review-bulk">
            <button className="btn btn-ghost btn-sm" onClick={() => setAll('accepted')} disabled={list.length === 0}>Accept all</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAll('rejected')} disabled={list.length === 0}>Reject all</button>
          </span>
        </div>

        <div className="modal-body polish-review-body">
          {paragraphs.map((para, pi) => (
            <p key={pi} className="polish-para">
              {para.targets.map((target, ti) => {
                const segs = segments[target.id];
                return (
                  <span key={target.id}>
                    {ti > 0 && ' '}
                    {segs
                      ? segs.map((seg, si) =>
                          seg.type === 'equal' ? (
                            <span key={si}>{seg.text}</span>
                          ) : (
                            <ChangeView key={seg.changeId} change={changes[seg.changeId]} onSet={setStatus} />
                          )
                        )
                      : <span className="polish-waiting">{target.text}</span>}
                  </span>
                );
              })}
            </p>
          ))}

          {parts.map((p, i) =>
            p.status === 'failed' && !fatal ? (
              <p key={i} className="polish-part-failed">
                Part {i + 1} of {parts.length} failed: {p.error}{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => runPart(i)}>Retry part</button>
              </p>
            ) : null
          )}
          {missing.length > 0 && (
            <p className="polish-note">
              {missing.length} passage{missing.length === 1 ? '' : 's'} came back unchanged.
            </p>
          )}
          <ContextUsed context={context} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => onClose(null)}>Discard</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={busy || accepted === 0}>
            Apply {accepted || ''} accepted change{accepted === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the Quill panel**

In `client/src/components/panel/QuillTab.jsx`:

1. Replace `import DraftPolishModal from '../overlays/DraftPolishModal.jsx';` with:

```jsx
import PolishReviewModal from '../overlays/PolishReviewModal.jsx';
import { getBlocks, chapterTargets, selectionTargets, batchTargets } from '../../utils/editorBlocks.js';
```

2. Replace `const [polishedDraft, setPolishedDraft] = useState(null);` with:

```jsx
  const [polishSession, setPolishSession] = useState(null);
  const [polishResult, setPolishResult] = useState(null);
```

3. Replace the whole `handlePolishDraft` function with:

```jsx
  function handlePolish() {
    const editorEl = document.querySelector('.editor');
    if (!editorEl) return;
    const blocks = getBlocks(editorEl);
    const mode = editorState.selection ? 'selection' : 'chapter';
    const targets = mode === 'selection' ? selectionTargets(blocks, editorState.selection) : chapterTargets(blocks);
    if (targets.length === 0) return;
    setPolishResult(null);
    setPolishSession({
      mode,
      batches: batchTargets(targets),
      blockTexts: blocks.map((b) => b.text),
      chapterText: editorState.content,
    });
  }
```

4. Replace the Polish button with:

```jsx
        <button
          className="btn btn-ghost quill-ai-btn quill-ai-btn--polish"
          onClick={handlePolish}
          disabled={loading || Boolean(polishSession) || !editorState.content?.trim()}
          title="Suggests rewrites you can accept or reject one by one, keeping the story direction unchanged"
        >
          ✦ Polish {editorState.selection ? 'selection' : 'chapter'}
        </button>
```

5. Directly after the closing `</div>` of that `quill-actions` block, add:

```jsx
      {polishResult && (
        <p className="polish-notice">
          Applied {polishResult.applied} change{polishResult.applied === 1 ? '' : 's'}
          {polishResult.skipped > 0 && ` · ${polishResult.skipped} skipped because the text changed`}
        </p>
      )}
```

6. Replace the `{polishedDraft && ( <DraftPolishModal … /> )}` block with:

```jsx
      {polishSession && (
        <PolishReviewModal
          workId={workId}
          chapterId={editorState.chapterId}
          session={polishSession}
          summariesPending={summaryRefreshPending(workState.chapters, editorState.chapterId, 'before')}
          onClose={(result) => {
            setPolishSession(null);
            setPolishResult(result);
          }}
        />
      )}
```

7. Delete the old modal: `git rm client/src/components/overlays/DraftPolishModal.jsx`.

- [ ] **Step 3: Styles**

Append to `client/src/index.css`:

```css
/* ============================================================
   Polish Review
   ============================================================ */
.polish-review-modal {
  width: min(900px, 94vw);
  max-width: none;
  max-height: 90vh;
}

.polish-review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.6rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.polish-review-status { font-size: 0.82rem; color: var(--text-muted); }
.polish-review-status--error { color: var(--error); }
.polish-review-bulk { display: flex; gap: 0.5rem; }

.polish-review-body {
  font-family: Georgia, serif;
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--text);
}

.polish-para { margin: 0 0 1rem; white-space: pre-wrap; }
.polish-waiting { color: var(--text-dim); }

.polish-change {
  border-radius: var(--radius-sm);
  padding: 0 0.1rem;
  background: rgba(201, 169, 110, 0.07);
}
.polish-change--accepted { background: rgba(93, 202, 165, 0.08); }
.polish-change--rejected { background: none; }

.polish-del { color: var(--coral); text-decoration: line-through; }
.polish-add { color: var(--teal); }
.polish-rejected { color: var(--text-muted); }

.polish-change-actions {
  display: inline-flex;
  gap: 0.15rem;
  margin-left: 0.3rem;
  vertical-align: middle;
}

.polish-change-btn {
  font-size: 0.7rem;
  line-height: 1;
  padding: 0.15rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
}
.polish-change-btn:hover { color: var(--text); border-color: var(--gold-dim); }
.polish-change-btn.active { color: var(--bg); background: var(--gold); border-color: var(--gold); }

.polish-part-failed { color: var(--error); font-size: 0.82rem; font-family: inherit; }
.polish-note, .polish-notice { color: var(--text-muted); font-size: 0.8rem; font-style: italic; }
.polish-notice { margin-top: 0.5rem; }

@media (max-width: 640px) {
  .polish-review-toolbar { padding: 0.6rem 1rem; }
}
```

- [ ] **Step 4: Build, test and commit**

Run: `npm --prefix client run build && npm --prefix client test && grep -rn "DraftPolishModal" client/src`
Expected: `✓ built`; tests PASS; grep prints nothing.

```bash
git add client/src/components/overlays/PolishReviewModal.jsx client/src/components/panel/QuillTab.jsx client/src/index.css
git commit -m "feat: review Polish suggestions sentence by sentence before applying

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end verification

**Files:** none committed. Scratch scripts go in the session scratchpad; the temporary `client/vite.verify.config.js` is deleted afterwards.

- [ ] **Step 1: Start a throwaway stack with the fake provider**

```bash
docker run -d --rm --name scriptorium-verify-mongo -p 27018:27017 docker.io/library/mongo:8
cd server && PORT=3011 NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake \
  MONGODB_URI=mongodb://localhost:27018/scriptorium_verify \
  DEV_AUTH_BYPASS=true ADMIN_EMAIL=dev@localhost node src/server.js   # background
```

Then create `client/vite.verify.config.js` from `client/vite.config.js` with the proxy target `http://localhost:3011` and port `5183`, and run `npx vite --config vite.verify.config.js` from `client/` (background).

- [ ] **Step 2: API checks**

With a work and chapter created through the API:

1. `POST /api/ai/polish-draft` with `{ workId, chapterId, chapterText: 'She walked very slowly. It rained.', targets: [{ id: 't1', text: 'She walked very slowly.' }, { id: 't2', text: 'It rained.' }] }` → 200, `rewrites` = `[{ id: 't1', text: 'She strode deeply slowly.' }, { id: 't2', text: 'It rained.' }]`, `missing: []`, `context.story === true`.
2. Same with `targets: []` → `400 MISSING_FIELD`; with 2,001 words → `400 TOO_LONG`; without `workId` → `400 MISSING_FIELD`; another user's work → `404`.

- [ ] **Step 3: Browser checks**

Seed a chapter through the API whose `contentHtml` is
`<div>Keep <b>bold</b> here. She walked very slowly.</div><div>The rain walked in. <i>Quiet</i> after.</div>` (and matching `content`). Open it in the Main Room, then:

1. **Chapter mode:** with no selection the button reads **✦ Polish chapter**. Click it → the modal lists both paragraphs, with 2 changes (`walked very` → `strode deeply`, `walked` → `strode`). Accept the first, reject the second, **Apply** → the editor HTML still contains `<b>bold</b>` and `<i>Quiet</i>`, the first sentence reads "She strode deeply slowly.", the second paragraph is unchanged, and the panel shows "Applied 1 change". After 5 s autosave stores it (`GET` the chapter: `contentHtml` contains `strode deeply` and `<b>bold</b>`).
2. **Selection mode:** select a few words inside "The rain walked in." → the button reads **✦ Polish selection** → the modal shows only that sentence with one change → Accept all → Apply → only that sentence changed.
3. **Long chapter:** seed a chapter with ~3,500 words (repeat "She walked very slowly. " in 30 paragraphs) → **Polish chapter** shows "Polishing part 1 of 3…" then the review; Accept all → Apply → every "walked very" became "strode deeply" and the paragraph count is unchanged.
4. **Skip path:** open Polish on a chapter, then in the browser console change the first block's text (`document.querySelector('.editor div').firstChild.data += ' extra'`), Accept all and Apply → the notice reports the skipped changes, and the other block's changes applied.
5. **No changes:** polish a sentence without `very`/`walked` → the modal says "No changes suggested."
6. No console errors throughout.

- [ ] **Step 4: Clean up**

```bash
rm -f client/vite.verify.config.js
docker stop scriptorium-verify-mongo
# stop the background server and vite processes
git status --short   # expected: clean
```

- [ ] **Step 5: Final test runs**

Run: `npm --prefix server test && npm --prefix client test && npm --prefix client run build`
Expected: all PASS, `✓ built`.
