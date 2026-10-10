# Shared Story Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground every relevant AI call in the story — premise/POV/tone, the Codex entries the text mentions, all world rules, the Map beat, and lazily generated, writer-editable summaries of earlier chapters — and show what context each call used.

**Architecture:** Pure helpers (`summaryText.js`, `contextBlock.js`) do hashing, status, mention matching and block formatting, and are unit-tested with `node --test`. `summaryService.js` generates and saves summaries (lazy, shared in-flight, conditional save). `storyContextService.buildContext()` loads data, ensures summaries, and returns `{ text, manifest }`; each AI route declares its `needs` and prepends `text` to its prompt, returning `manifest` as `context`. The client shows a `ContextUsed` line and a Summary modal.

**Tech Stack:** Express 4 + Mongoose 8 (ESM), Node 24 built-in test runner, React 18 + Vite 5, plain CSS.

**Spec:** `docs/superpowers/specs/2026-10-10-story-context-design.md`

## Global Constraints

- Branch: `feat/story-context`. Commit after every task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server and client are ESM. No new npm dependencies (test runner is `node --test`).
- Summaries: ~100–150 words, `maxTokensOverride: 300`, input truncated from the middle above **24,000** characters, at most **3** generations at once.
- Codex entries cut to ~**400** characters each; Codex section budget **8,000** characters (drop characters/places with fewest mentions first; keep all world rules). Summaries are never trimmed.
- An edited summary (`summary.edited === true`) is never regenerated automatically.
- `NO_API_KEY` from any LLM call (including summary generation) fails the whole request with the existing `NO_API_KEY` error. Any other summary failure is counted in `manifest.unavailable` and the main call proceeds.
- The fake LLM provider is only usable when `NODE_ENV === 'test'`.
- Work-scoped routes keep using `loadWork`; AI routes taking `workId` in the body use `loadWorkFromBody()` (`server/src/middleware/loadWork.js`).
- Node commands run directly on this machine (`node`, `npm`, `npx` are on PATH); the dev Docker stack is Podman (`docker` CLI). No linter.

## Review Focus

1. **Codex aliases stored as a string** — the Codex UI saves `aliases` via a text field, so it is often `"Lady Mara, The Grey"` rather than an array. Matching must split strings on commas/semicolons, not crash or treat the whole string as one alias. (Test in Task 2.)
2. **Non-ASCII and punctuated names** — names like `Zoë`, `Ana-Lucía`, `O'Brien` or `Mr. Vell` must match as whole words; `\b` breaks on non-ASCII letters, and unescaped `.` would over-match. (Tests in Task 2.)
3. **Missing API key during summary generation** — must surface as `NO_API_KEY` for the whole request, not be swallowed into `unavailable`. (Test in Task 3.)
4. **LLM returns an empty or chatty summary** (`"Here is a summary:\n\n…"`, wrapping quotes, blank) — strip the preamble/quotes; treat blank as a failure, never save an empty summary. (Tests in Tasks 1 and 3.)
5. **`chapterId` that isn't in the work** (stale client state, or another user's id) — ignored: no chapter-specific context, no error, no data from the other chapter. (Verified in Task 9 API checks.)

---

## File Structure

**Server — create**
- `server/src/services/summaryText.js` — pure: `hashContent`, `summaryStatus`, `needsGeneration`, `truncateMiddle`, `cleanSummary`.
- `server/src/services/contextBlock.js` — pure: `normalizeAliases`, `countMentions`, `findMentions`, `formatContextBlock`.
- `server/src/utils/runLimited.js` — pure: bounded-concurrency map.
- `server/src/services/summaryService.js` — `generateSummary`, `ensureSummaries`.
- `server/src/services/storyContextService.js` — `buildContext`.
- `server/src/services/providers/fake.js` — deterministic test provider.
- `server/test/summaryText.test.js`, `server/test/contextBlock.test.js`, `server/test/runLimited.test.js`, `server/test/summaryService.test.js`.

**Server — modify**
- `server/package.json` — `test` script.
- `server/src/models/Chapter.js` — `summary` subdocument.
- `server/src/services/llmService.js` — fake provider override in test mode.
- `server/src/routes/chapters.js` — list `summaryStatus`, strip `summary` from PUT, summary endpoints.
- `server/src/routes/ai.js` — context on each route, ownership on polish/editor-review/codex-suggest/beat-suggest.

**Client — create**
- `client/src/utils/summaryStatus.js` — status labels, `summaryRefreshPending`.
- `client/src/components/panel/ContextUsed.jsx` — the "Context used" line.
- `client/src/components/overlays/ChapterSummaryModal.jsx` — view/edit/regenerate a summary.

**Client — modify**
- `client/src/components/panel/QuillTab.jsx`, `client/src/components/overlays/DraftPolishModal.jsx`, `client/src/components/overlays/EditorReviewModal.jsx`, `client/src/components/overlays/CodexAuditModal.jsx`, `client/src/components/codex/CodexSuggestPanel.jsx` (+ its three parents), `client/src/components/map/ChapterDetail.jsx`, `client/src/components/editor/Toolbar.jsx`, `client/src/index.css`.

---

### Task 1: Test runner, summary helpers, Chapter.summary field

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/models/Chapter.js`
- Create: `server/src/services/summaryText.js`
- Test: `server/test/summaryText.test.js`

**Interfaces:**
- Produces:
  - `hashContent(text: string): string` — sha1 hex of `text || ''`.
  - `summaryStatus(chapter: { content?: string, summary?: { text?, sourceHash?, edited? } }): 'none'|'current'|'outdated'|'edited'|'edited-outdated'`
  - `needsGeneration(chapter): boolean` — true when content is non-blank and status is `none` or `outdated`.
  - `truncateMiddle(text: string, maxChars: number): string`
  - `cleanSummary(raw: string): string` — `''` when nothing usable.
  - Chapter documents gain `summary: { text, sourceHash, generatedAt, edited }`.

- [ ] **Step 1: Add the test script**

In `server/package.json`, change `"scripts"` to:

```json
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test \"test/**/*.test.js\""
  },
```

- [ ] **Step 2: Write the failing tests**

Create `server/test/summaryText.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashContent,
  summaryStatus,
  needsGeneration,
  truncateMiddle,
  cleanSummary,
} from '../src/services/summaryText.js';

const content = 'The bell rang twice.';
const hash = hashContent(content);

test('hashContent is stable and treats missing text as empty', () => {
  assert.equal(hashContent(content), hash);
  assert.equal(hashContent(undefined), hashContent(''));
  assert.notEqual(hashContent('a'), hashContent('b'));
});

test('summaryStatus covers all five states', () => {
  assert.equal(summaryStatus({ content }), 'none');
  assert.equal(summaryStatus({ content, summary: { text: '' } }), 'none');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: hash } }), 'current');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: 'old' } }), 'outdated');
  assert.equal(summaryStatus({ content, summary: { text: 'S', sourceHash: hash, edited: true } }), 'edited');
  assert.equal(
    summaryStatus({ content, summary: { text: 'S', sourceHash: 'old', edited: true } }),
    'edited-outdated'
  );
});

test('needsGeneration skips empty chapters and edited summaries', () => {
  assert.equal(needsGeneration({ content: '   ' }), false);
  assert.equal(needsGeneration({ content }), true);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: 'old' } }), true);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: hash } }), false);
  assert.equal(needsGeneration({ content, summary: { text: 'S', sourceHash: 'old', edited: true } }), false);
});

test('truncateMiddle leaves short text alone and keeps head and tail of long text', () => {
  assert.equal(truncateMiddle('short', 100), 'short');
  assert.equal(truncateMiddle('', 100), '');
  const long = 'A'.repeat(500) + 'MIDDLE' + 'Z'.repeat(500);
  const out = truncateMiddle(long, 200);
  assert.ok(out.length <= 200);
  assert.ok(out.startsWith('AAAA'));
  assert.ok(out.endsWith('ZZZZ'));
  assert.ok(!out.includes('MIDDLE'));
  assert.ok(out.includes('[…]'));
});

test('cleanSummary strips preambles, labels and wrapping quotes', () => {
  assert.equal(cleanSummary('  Mara arrives.  '), 'Mara arrives.');
  assert.equal(cleanSummary("Here is a summary of the chapter:\n\nMara arrives."), 'Mara arrives.');
  assert.equal(cleanSummary("Here's the summary: Mara arrives."), 'Mara arrives.');
  assert.equal(cleanSummary('Summary: Mara arrives.'), 'Mara arrives.');
  assert.equal(cleanSummary('"Mara arrives."'), 'Mara arrives.');
  assert.equal(cleanSummary('   '), '');
  assert.equal(cleanSummary(undefined), '');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '…/src/services/summaryText.js'`.

- [ ] **Step 4: Implement the helpers**

Create `server/src/services/summaryText.js`:

```js
import crypto from 'node:crypto';

export function hashContent(text) {
  return crypto.createHash('sha1').update(text || '').digest('hex');
}

// none | current | outdated | edited | edited-outdated
export function summaryStatus(chapter) {
  const summary = chapter.summary || {};
  if (!summary.text) return 'none';
  const fresh = summary.sourceHash === hashContent(chapter.content || '');
  if (summary.edited) return fresh ? 'edited' : 'edited-outdated';
  return fresh ? 'current' : 'outdated';
}

// Edited summaries are never regenerated automatically; empty chapters get none
export function needsGeneration(chapter) {
  if (!chapter.content || !chapter.content.trim()) return false;
  const status = summaryStatus(chapter);
  return status === 'none' || status === 'outdated';
}

// Keeps the opening and the ending, which matter most for a summary
export function truncateMiddle(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const marker = '\n\n[…]\n\n';
  const keep = maxChars - marker.length;
  const head = Math.ceil(keep / 2);
  return text.slice(0, head) + marker + text.slice(text.length - (keep - head));
}

export function cleanSummary(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  text = text.replace(/^(here is|here's)[^:\n]*:\s*/i, '');
  text = text.replace(/^summary:\s*/i, '');
  text = text.trim();
  if (text.length >= 2 && /^["“]/.test(text) && /["”]$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
```

- [ ] **Step 5: Add the summary field to the Chapter model**

In `server/src/models/Chapter.js`, add a schema above `chapterSchema`:

```js
const summarySchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    sourceHash: { type: String, default: '' }, // sha1 of `content` the summary describes
    generatedAt: { type: String, default: null },
    edited: { type: Boolean, default: false }, // set when the writer edits it
  },
  { _id: false }
);
```

and add this field to `chapterSchema` after `notes`:

```js
    summary: { type: summarySchema, default: () => ({}) },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS — 5 tests. Also run `node --check src/models/Chapter.js` (no output = OK).

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/src/models/Chapter.js server/src/services/summaryText.js server/test/summaryText.test.js
git commit -m "feat: add chapter summary field and summary helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Codex mention matching and context block formatting

**Files:**
- Create: `server/src/services/contextBlock.js`
- Test: `server/test/contextBlock.test.js`

**Interfaces:**
- Produces:
  - `normalizeAliases(aliases: string|string[]|undefined): string[]` — strings split on `,` or `;`, trimmed, blanks removed.
  - `countMentions(term: string, text: string): number` — whole-word, case-insensitive, Unicode-aware.
  - `findMentions(codex, text): Array<{ type: 'character'|'place', entry, count }>` — only entries with `count > 0`, sorted by `count` descending.
  - `formatContextBlock({ story, summaries, mentions, rules, mapBeat }): { text: string, codexNames: string[], rules: number }`
    - `story`: `{ title, genre, pov, tone, protagonist, premise }` or `null`
    - `summaries`: `Array<{ number, title, text }>` or `null` (`text` may be `''` → title only)
    - `mentions`: output of `findMentions`, or `null`
    - `rules`: world-rule entries `{ category, rule, description }[]`, or `null`
    - `mapBeat`: `{ act, beat, notes }` or `null`
    - Returns `text: ''` when every section is empty.

- [ ] **Step 1: Write the failing tests**

Create `server/test/contextBlock.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAliases,
  countMentions,
  findMentions,
  formatContextBlock,
} from '../src/services/contextBlock.js';

test('normalizeAliases accepts arrays and comma/semicolon strings', () => {
  assert.deepEqual(normalizeAliases(['Lady Mara', ' ', 'The Grey']), ['Lady Mara', 'The Grey']);
  assert.deepEqual(normalizeAliases('Lady Mara, The Grey; Mar'), ['Lady Mara', 'The Grey', 'Mar']);
  assert.deepEqual(normalizeAliases(undefined), []);
  assert.deepEqual(normalizeAliases(''), []);
});

test('countMentions is whole-word and case-insensitive', () => {
  assert.equal(countMentions('Al', 'Al met Alice. AL left.'), 2);
  assert.equal(countMentions('Mara', 'Lady Mara; mara! Maras'), 2);
  assert.equal(countMentions('  ', 'anything'), 0);
});

test('countMentions handles non-ASCII letters and regex characters', () => {
  assert.equal(countMentions('Zoë', 'Zoë ran. Zoëy did not.'), 1);
  assert.equal(countMentions('Ana-Lucía', 'Then Ana-Lucía spoke.'), 1);
  assert.equal(countMentions("O'Brien", "O'Brien's coat"), 1);
  assert.equal(countMentions('Mr. Vell', 'Mr. Vell and MrX Vell'), 1);
});

test('findMentions matches names and string aliases, sorted by count', () => {
  const codex = {
    characters: [
      { name: 'Mara', aliases: 'The Grey, Lady M' },
      { name: 'Tomas', aliases: [] },
      { name: 'Absent' },
    ],
    places: [{ name: 'Vell Keep' }],
  };
  const text = 'Mara entered Vell Keep. The Grey watched. Mara sighed. Tomas slept.';
  const found = findMentions(codex, text);
  assert.deepEqual(
    found.map((m) => [m.type, m.entry.name, m.count]),
    [
      ['character', 'Mara', 3],
      ['place', 'Vell Keep', 1],
      ['character', 'Tomas', 1],
    ]
  );
  assert.deepEqual(findMentions(null, text), []);
  assert.deepEqual(findMentions(codex, ''), []);
});

test('formatContextBlock omits empty sections and returns empty text when nothing applies', () => {
  const empty = formatContextBlock({ story: { title: '', genre: '' }, summaries: [], mentions: [], rules: [], mapBeat: null });
  assert.equal(empty.text, '');
  assert.deepEqual(empty.codexNames, []);
  assert.equal(empty.rules, 0);
});

test('formatContextBlock renders sections in order', () => {
  const out = formatContextBlock({
    story: { title: 'Bells', genre: 'Fantasy', pov: 'Third', tone: '', protagonist: 'Mara', premise: 'A city of bells.' },
    summaries: [
      { number: 1, title: 'Arrival', text: 'Mara arrives.' },
      { number: 2, title: 'Silence', text: '' },
    ],
    mentions: [{ type: 'character', entry: { name: 'Mara', aliases: 'The Grey', role: 'Lead', physical: { eyeColor: 'grey' } }, count: 2 }],
    rules: [{ category: 'magic', rule: 'Bells bind oaths', description: '' }],
    mapBeat: { act: 'Act II', beat: 'Midpoint', notes: '' },
  });
  const t = out.text;
  assert.ok(t.startsWith('<story_context>'));
  assert.ok(t.trimEnd().endsWith('</story_context>'));
  const order = ['## Story', '## Story so far', '## Codex', '## This chapter on the Map'].map((h) => t.indexOf(h));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(t.includes('Genre: Fantasy · POV: Third'));
  assert.ok(!t.includes('Tone:'));
  assert.ok(t.includes('Ch. 1 — Arrival: Mara arrives.'));
  assert.ok(t.includes('Ch. 2 — Silence'));
  assert.ok(t.includes('- Mara (aka The Grey) — role: Lead; physical: eye color grey'));
  assert.ok(t.includes('- [magic] Bells bind oaths'));
  assert.ok(t.includes('Act II · Beat: Midpoint'));
  assert.deepEqual(out.codexNames, ['Mara']);
  assert.equal(out.rules, 1);
});

test('formatContextBlock cuts long entries to about 400 characters', () => {
  const out = formatContextBlock({
    story: null, summaries: null, rules: null, mapBeat: null,
    mentions: [{ type: 'place', entry: { name: 'Keep', description: 'x'.repeat(2000) }, count: 1 }],
  });
  const line = out.text.split('\n').find((l) => l.startsWith('- Keep'));
  assert.ok(line.length <= 402);
  assert.ok(line.endsWith('…'));
});

test('formatContextBlock trims fewest-mentioned Codex entries over budget, keeping rules and summaries', () => {
  const big = (name, count) => ({ type: 'character', entry: { name, notes: 'n'.repeat(390) }, count });
  const mentions = Array.from({ length: 30 }, (_, i) => big(`Name${i}`, 30 - i));
  const summaries = Array.from({ length: 50 }, (_, i) => ({ number: i + 1, title: `T${i}`, text: 's'.repeat(300) }));
  const out = formatContextBlock({
    story: null, mapBeat: null, summaries, mentions,
    rules: [{ category: 'magic', rule: 'Rule A' }, { category: 'law', rule: 'Rule B' }],
  });
  const codexSection = out.text.slice(out.text.indexOf('## Codex'), out.text.indexOf('</story_context>')).trimEnd();
  assert.ok(codexSection.length <= 8000);
  assert.ok(out.codexNames.length < 30);
  assert.deepEqual(out.codexNames, mentions.slice(0, out.codexNames.length).map((m) => m.entry.name));
  assert.equal(out.rules, 2);
  assert.ok(out.text.includes('Rule A') && out.text.includes('Rule B'));
  assert.equal((out.text.match(/^Ch\. /gm) || []).length, 50);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '…/src/services/contextBlock.js'`.

- [ ] **Step 3: Implement**

Create `server/src/services/contextBlock.js`:

```js
const ENTRY_MAX = 400;
const CODEX_BUDGET = 8000;
const WORD_CHAR = '[\\p{L}\\p{N}_]';

const HEADER =
  "Reference material about the writer's story. Use it to stay consistent with established facts and events. Do not edit, summarise, or comment on it unless asked.";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// The Codex UI saves aliases from a text field, so they are often one string
export function normalizeAliases(aliases) {
  const list = Array.isArray(aliases) ? aliases : typeof aliases === 'string' ? aliases.split(/[,;]/) : [];
  return list.filter(nonBlank).map((a) => a.trim());
}

// Whole-word, case-insensitive; Unicode-aware because \b only knows ASCII
export function countMentions(term, text) {
  if (!nonBlank(term) || !text) return 0;
  const re = new RegExp(`(?<!${WORD_CHAR})${escapeRegex(term.trim())}(?!${WORD_CHAR})`, 'giu');
  return (text.match(re) || []).length;
}

export function findMentions(codex, text) {
  if (!codex || !text) return [];
  const found = [];
  for (const [type, list] of [['character', codex.characters], ['place', codex.places]]) {
    for (const entry of list || []) {
      const terms = [entry.name, ...normalizeAliases(entry.aliases)].filter(nonBlank);
      const count = terms.reduce((sum, term) => sum + countMentions(term, text), 0);
      if (count > 0) found.push({ type, entry, count });
    }
  }
  return found.sort((a, b) => b.count - a.count);
}

function formatPhysical(physical) {
  if (nonBlank(physical)) return physical.trim();
  if (!physical || typeof physical !== 'object') return '';
  const labels = { eyeColor: 'eye color', hairColor: 'hair color', build: 'build' };
  return Object.entries(physical)
    .filter(([, v]) => nonBlank(v))
    .map(([k, v]) => `${labels[k] || k} ${v.trim()}`)
    .join(', ');
}

function formatEntry(type, entry) {
  const aliases = normalizeAliases(entry.aliases);
  const head = aliases.length ? `${entry.name} (aka ${aliases.join(', ')})` : entry.name;
  const fields =
    type === 'character'
      ? [['role', entry.role], ['physical', formatPhysical(entry.physical)], ['notes', entry.notes]]
      : [['description', entry.description], ['notes', entry.notes]];
  const details = fields
    .filter(([, v]) => nonBlank(v))
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join('; ');
  return '- ' + clip(details ? `${head} — ${details}` : head, ENTRY_MAX);
}

function formatRule(rule) {
  const text = [rule.rule, rule.description].filter(nonBlank).map((s) => s.trim()).join(' — ');
  if (!text) return null;
  const category = nonBlank(rule.category) ? `[${rule.category.trim()}] ` : '';
  return '- ' + clip(category + text, ENTRY_MAX);
}

function storySection(story) {
  if (!story) return '';
  const lines = [];
  if (nonBlank(story.title)) lines.push(`Title: ${story.title.trim()}`);
  const meta = [['Genre', story.genre], ['POV', story.pov], ['Tone', story.tone]]
    .filter(([, v]) => nonBlank(v))
    .map(([k, v]) => `${k}: ${v.trim()}`);
  if (meta.length) lines.push(meta.join(' · '));
  if (nonBlank(story.protagonist)) lines.push(`Protagonist: ${story.protagonist.trim()}`);
  if (nonBlank(story.premise)) lines.push(`Premise: ${story.premise.trim()}`);
  return lines.length ? `## Story\n${lines.join('\n')}` : '';
}

function summariesSection(summaries) {
  if (!summaries || summaries.length === 0) return '';
  const lines = summaries.map((s) => {
    const label = `Ch. ${s.number} — ${s.title || 'Untitled'}`;
    return nonBlank(s.text) ? `${label}: ${s.text.trim()}` : label;
  });
  return `## Story so far\n${lines.join('\n')}`;
}

function codexSection(mentions, rules) {
  const ruleLines = (rules || []).map(formatRule).filter(Boolean);
  const kept = [...(mentions || [])];

  const render = () => {
    const parts = [];
    const characters = kept.filter((m) => m.type === 'character').map((m) => formatEntry('character', m.entry));
    const places = kept.filter((m) => m.type === 'place').map((m) => formatEntry('place', m.entry));
    if (characters.length) parts.push(`Characters:\n${characters.join('\n')}`);
    if (places.length) parts.push(`Places:\n${places.join('\n')}`);
    if (ruleLines.length) parts.push(`World rules:\n${ruleLines.join('\n')}`);
    return parts.length ? `## Codex\n${parts.join('\n')}` : '';
  };

  // Mentions arrive sorted by count, so popping drops the least-mentioned first
  let text = render();
  while (text.length > CODEX_BUDGET && kept.length > 0) {
    kept.pop();
    text = render();
  }
  return { text, codexNames: kept.map((m) => m.entry.name), rules: ruleLines.length };
}

function mapSection(mapBeat) {
  if (!mapBeat) return '';
  const parts = [];
  if (nonBlank(mapBeat.act)) parts.push(mapBeat.act.trim());
  if (nonBlank(mapBeat.beat)) parts.push(`Beat: ${mapBeat.beat.trim()}`);
  if (nonBlank(mapBeat.notes)) parts.push(`Notes: ${mapBeat.notes.trim()}`);
  return parts.length ? `## This chapter on the Map\n${parts.join(' · ')}` : '';
}

export function formatContextBlock({ story, summaries, mentions, rules, mapBeat }) {
  const codex = codexSection(mentions, rules);
  const sections = [storySection(story), summariesSection(summaries), codex.text, mapSection(mapBeat)].filter(Boolean);
  const text = sections.length ? `<story_context>\n${HEADER}\n\n${sections.join('\n\n')}\n</story_context>` : '';
  return { text, codexNames: codex.codexNames, rules: codex.rules };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS — all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/contextBlock.js server/test/contextBlock.test.js
git commit -m "feat: add codex mention matching and story context block formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Summary generation service and fake provider

**Files:**
- Create: `server/src/utils/runLimited.js`
- Create: `server/src/services/summaryService.js`
- Create: `server/src/services/providers/fake.js`
- Modify: `server/src/services/llmService.js`
- Test: `server/test/runLimited.test.js`, `server/test/summaryService.test.js`

**Interfaces:**
- Consumes: `hashContent`, `needsGeneration`, `truncateMiddle`, `cleanSummary` (Task 1); `complete({ system, prompt, maxTokensOverride, userId })` from `llmService.js`.
- Produces:
  - `runLimited(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void>` — rejects on the first rejection.
  - `generateSummary(work, chapter): Promise<string>` — `work` needs `_id`, `ownerId`, `title`; `chapter` needs `_id`, `number`, `title`, `content`. Throws on `NO_API_KEY`, provider errors, and blank output (`err.code = 'EMPTY_SUMMARY'`). Saves only if the chapter's `content` is unchanged and `summary.edited` is not true. Concurrent calls for the same chapter+content share one promise.
  - `ensureSummaries(work, chapters, { generate = generateSummary } = {}): Promise<{ summaries: Map<chapterId, string>, unavailable: number }>` — `chapters` are lean docs with `_id`, `content`, `summary`. Skips chapters with blank content; reuses existing summaries unless `needsGeneration`; rethrows `NO_API_KEY`.
  - Test-only: with `NODE_ENV=test` and `LLM_PROVIDER_OVERRIDE=fake`, `complete()` uses `providers/fake.js` and skips the API-key check.

- [ ] **Step 1: Write the failing tests**

Create `server/test/runLimited.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLimited } from '../src/utils/runLimited.js';

test('runLimited processes every item with at most `limit` running at once', async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    seen.push(n);
    running -= 1;
  });
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('runLimited rejects when a task rejects', async () => {
  await assert.rejects(
    runLimited([1, 2], 2, async (n) => {
      if (n === 2) throw new Error('boom');
    }),
    /boom/
  );
});

test('runLimited resolves for an empty list', async () => {
  await runLimited([], 3, async () => {
    throw new Error('should not run');
  });
});
```

Create `server/test/summaryService.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSummaries } from '../src/services/summaryService.js';
import { hashContent } from '../src/services/summaryText.js';

const work = { _id: 'work_1', ownerId: 'user_1', title: 'Bells' };
const ch = (id, content, summary) => ({ _id: id, number: 1, title: id, content, summary });

test('ensureSummaries reuses fresh and edited summaries, generates the rest, skips empty chapters', async () => {
  const generated = [];
  const chapters = [
    ch('c1', 'one', { text: 'fresh', sourceHash: hashContent('one') }),
    ch('c2', 'two', { text: 'mine', sourceHash: 'old', edited: true }),
    ch('c3', 'three', { text: 'stale', sourceHash: 'old' }),
    ch('c4', 'four'),
    ch('c5', '   '),
  ];
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    generate: async (_w, c) => {
      generated.push(c._id);
      return `new ${c._id}`;
    },
  });
  assert.deepEqual(generated.sort(), ['c3', 'c4']);
  assert.equal(summaries.get('c1'), 'fresh');
  assert.equal(summaries.get('c2'), 'mine');
  assert.equal(summaries.get('c3'), 'new c3');
  assert.equal(summaries.get('c4'), 'new c4');
  assert.equal(summaries.has('c5'), false);
  assert.equal(unavailable, 0);
});

test('ensureSummaries counts failures as unavailable and keeps going', async () => {
  const chapters = [ch('c1', 'one'), ch('c2', 'two')];
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    generate: async (_w, c) => {
      if (c._id === 'c1') {
        const err = new Error('Summary was empty');
        err.code = 'EMPTY_SUMMARY';
        throw err;
      }
      return 'ok';
    },
  });
  assert.equal(unavailable, 1);
  assert.equal(summaries.has('c1'), false);
  assert.equal(summaries.get('c2'), 'ok');
});

test('ensureSummaries rethrows NO_API_KEY instead of counting it', async () => {
  await assert.rejects(
    ensureSummaries(work, [ch('c1', 'one')], {
      generate: async () => {
        const err = new Error('No API key configured for active provider');
        err.code = 'NO_API_KEY';
        throw err;
      },
    }),
    (err) => err.code === 'NO_API_KEY'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npm test`
Expected: FAIL — cannot find `runLimited.js` / `summaryService.js`.

- [ ] **Step 3: Implement `runLimited`**

Create `server/src/utils/runLimited.js`:

```js
// Runs fn over items with at most `limit` promises in flight
export async function runLimited(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      await fn(queue.shift());
    }
  });
  await Promise.all(workers);
}
```

- [ ] **Step 4: Implement the summary service**

Create `server/src/services/summaryService.js`:

```js
import Chapter from '../models/Chapter.js';
import { complete } from './llmService.js';
import { hashContent, needsGeneration, truncateMiddle, cleanSummary } from './summaryText.js';
import { runLimited } from '../utils/runLimited.js';

const MAX_INPUT_CHARS = 24000;
const CONCURRENCY = 3;

const SUMMARY_SYSTEM =
  'You summarise chapters of fiction accurately and concisely for the author. Never invent events.';

// Shared per chapter+content so concurrent requests generate once
// (single server process, as deployed)
const inflight = new Map();

function summaryPrompt(work, chapter) {
  return `Summarise this chapter for the writer's own reference. Later AI help relies on it to stay consistent with the story.

Work: ${work.title || 'Untitled'}
Chapter ${chapter.number ?? ''}: ${chapter.title || 'Untitled'}

Write 100–150 words of plain prose — no headings, lists, or preamble. Cover what happens, who is involved, any facts or reveals later chapters depend on, and how the chapter ends emotionally.

Chapter text:
${truncateMiddle(chapter.content || '', MAX_INPUT_CHARS)}`;
}

export function generateSummary(work, chapter) {
  const sourceHash = hashContent(chapter.content);
  const key = `${chapter._id}:${sourceHash}`;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const raw = await complete({
      system: SUMMARY_SYSTEM,
      prompt: summaryPrompt(work, chapter),
      maxTokensOverride: 300,
      userId: work.ownerId,
    });
    const text = cleanSummary(raw);
    if (!text) {
      const err = new Error('Summary was empty');
      err.code = 'EMPTY_SUMMARY';
      throw err;
    }

    // Only save if the chapter still has the text we summarised and the
    // writer hasn't edited the summary meanwhile
    await Chapter.updateOne(
      { _id: chapter._id, content: chapter.content, 'summary.edited': { $ne: true } },
      {
        $set: {
          'summary.text': text,
          'summary.sourceHash': sourceHash,
          'summary.generatedAt': new Date().toISOString(),
          'summary.edited': false,
        },
      }
    );
    return text;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export async function ensureSummaries(work, chapters, { generate = generateSummary } = {}) {
  const summaries = new Map();
  let unavailable = 0;
  const todo = [];

  for (const chapter of chapters) {
    if (!chapter.content || !chapter.content.trim()) continue;
    if (needsGeneration(chapter)) todo.push(chapter);
    else summaries.set(chapter._id, chapter.summary.text);
  }

  await runLimited(todo, CONCURRENCY, async (chapter) => {
    try {
      summaries.set(chapter._id, await generate(work, chapter));
    } catch (err) {
      if (err.code === 'NO_API_KEY') throw err;
      console.error(`Summary generation failed for ${chapter._id}:`, err.message);
      unavailable += 1;
    }
  });

  return { summaries, unavailable };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS — all tests (summaryText, contextBlock, runLimited, summaryService).

- [ ] **Step 6: Add the fake provider**

Create `server/src/services/providers/fake.js`:

```js
// Deterministic provider for local verification. Only reachable when
// NODE_ENV=test and LLM_PROVIDER_OVERRIDE=fake (see llmService.complete).
const JSON_OBJECT = {
  overall: 'Fake pacing assessment.',
  flags: [],
  summary: 'Fake editorial summary.',
  findings: [],
  suggestions: [{ field: null, text: 'Fake suggestion.' }],
  lastScene: 'Fake last scene.',
  toneNote: 'Fake tone.',
  voiceSample: 'fake voice',
  characterMood: 'Fake mood.',
  suggestedBeat: 'Fake beat.',
  rationale: 'Fake rationale.',
  writingPrompt: 'Fake prompt.',
  tensionScore: 5,
};

export async function complete({ prompt }) {
  if (prompt.startsWith('Summarise this chapter')) {
    const title = (prompt.match(/^Chapter [^\n]*$/m) || ['Chapter'])[0];
    return `Fake summary of ${title}.`;
  }
  if (prompt.includes('Return ONLY a JSON array')) {
    return JSON.stringify(['Fake hook one.', 'Fake hook two.', 'Fake hook three.']);
  }
  if (prompt.includes('Return ONLY a JSON object')) {
    return JSON.stringify(JSON_OBJECT);
  }
  // Plain-text routes (polish-draft) echo the prompt so checks can inspect it
  return `ECHO\n${prompt}`;
}
```

- [ ] **Step 7: Wire the fake provider into `complete()`**

In `server/src/services/llmService.js`, add the import:

```js
import * as fakeProvider from './providers/fake.js';
```

and at the top of `complete()` (before `const settings = …`):

```js
  // Local verification only: never reachable in development or production
  if (process.env.NODE_ENV === 'test' && process.env.LLM_PROVIDER_OVERRIDE === 'fake') {
    return fakeProvider.complete({ system, prompt });
  }
```

- [ ] **Step 8: Verify and commit**

Run: `cd server && npm test && node --check src/services/llmService.js`
Expected: PASS, no syntax errors.

```bash
git add server/src/utils/runLimited.js server/src/services/summaryService.js server/src/services/providers/fake.js server/src/services/llmService.js server/test/runLimited.test.js server/test/summaryService.test.js
git commit -m "feat: add lazy chapter summary generation and a test-only fake provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Context builder

**Files:**
- Create: `server/src/services/storyContextService.js`

**Interfaces:**
- Consumes: `ensureSummaries` (Task 3), `findMentions`, `formatContextBlock` (Task 2), models `Chapter`, `Codex`, `Map`.
- Produces: `buildContext({ work, chapterId?, sourceText?, needs }): Promise<{ text: string, manifest: object | null }>`
  - `work`: Mongoose `Work` document (`req.work`).
  - `needs`: `{ story?: boolean, codex?: boolean, summaries?: 'before'|'all'|false, mapBeat?: boolean }`.
  - `manifest` (or `null` when `text` is empty): `{ story: boolean, summaries: number, unavailable: number, codex: string[], rules: number, act: string|null, beat: string|null }`.
  - A `chapterId` not belonging to `work` is treated as absent.
  - Throws `NO_API_KEY` from summary generation.

- [ ] **Step 1: Implement**

Create `server/src/services/storyContextService.js`:

```js
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import { ensureSummaries } from './summaryService.js';
import { findMentions, formatContextBlock } from './contextBlock.js';

export async function buildContext({ work, chapterId, sourceText = '', needs = {} }) {
  const workId = work._id;
  const needChapters = Boolean(needs.summaries || needs.mapBeat);

  const [chapters, codex, map] = await Promise.all([
    needChapters
      ? Chapter.find({ workId }).select('number title order content summary').sort({ order: 1 }).lean()
      : [],
    needs.codex ? Codex.findOne({ workId }).lean() : null,
    needs.mapBeat ? MapModel.findOne({ workId }).lean() : null,
  ]);

  // Only chapters of this work count; anything else is ignored
  const current = chapterId ? chapters.find((c) => c._id === chapterId) || null : null;

  let summaries = null;
  let unavailable = 0;
  if (needs.summaries) {
    const targets =
      needs.summaries === 'all'
        ? chapters
        : current
          ? chapters.filter((c) => c.order < current.order)
          : [];
    const withText = targets.filter((c) => c.content && c.content.trim());
    const result = await ensureSummaries(work, withText);
    unavailable = result.unavailable;
    summaries = withText.map((c) => ({
      number: c.number,
      title: c.title,
      text: result.summaries.get(c._id) || '',
    }));
  }

  const mapEntry = current && map?.chapters?.[current._id];
  const mapBeat = needs.mapBeat && mapEntry ? { act: mapEntry.act, beat: mapEntry.beat, notes: mapEntry.notes } : null;

  const story = needs.story
    ? {
        title: work.title,
        genre: work.genre,
        pov: work.pov,
        tone: work.tone,
        protagonist: work.protagonist,
        premise: work.premise,
      }
    : null;

  const { text, codexNames, rules } = formatContextBlock({
    story,
    summaries,
    mentions: needs.codex ? findMentions(codex, sourceText) : null,
    rules: needs.codex ? codex?.worldRules || [] : null,
    mapBeat,
  });

  if (!text) return { text: '', manifest: null };

  return {
    text,
    manifest: {
      story: text.includes('## Story\n'),
      summaries: (summaries || []).filter((s) => s.text).length,
      unavailable,
      codex: codexNames,
      rules,
      act: mapBeat?.act || null,
      beat: mapBeat?.beat || null,
    },
  };
}
```

- [ ] **Step 2: Syntax-check and run the existing tests**

Run: `cd server && node --check src/services/storyContextService.js && npm test`
Expected: no syntax errors; all tests PASS. (`buildContext` is exercised end-to-end in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add server/src/services/storyContextService.js
git commit -m "feat: add story context builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chapter summary endpoints and list status

**Files:**
- Modify: `server/src/routes/chapters.js`

**Interfaces:**
- Consumes: `summaryStatus`, `hashContent` (Task 1), `generateSummary` (Task 3).
- Produces:
  - `GET /api/works/:workId/chapters` — each chapter now includes `summary` and `summaryStatus`, and still no `content`, `contentHtml`, or `draftHistory`.
  - `PUT /api/works/:workId/chapters/:chapterId/summary` body `{ text: string }` → `{ summary, summaryStatus }`. Blank text clears the summary (`edited: false`).
  - `POST /api/works/:workId/chapters/:chapterId/summary/regenerate` → `{ summary, summaryStatus }`; `400 EMPTY_CHAPTER` when content is blank; `400 NO_API_KEY` without a key.
  - `PUT /api/works/:workId/chapters/:chapterId` ignores a `summary` field in the body.

- [ ] **Step 1: Update imports**

In `server/src/routes/chapters.js`, add:

```js
import { summaryStatus, hashContent } from '../services/summaryText.js';
import { generateSummary } from '../services/summaryService.js';
```

- [ ] **Step 2: Return `summaryStatus` from the list**

Replace the body of `GET /` with:

```js
    const { workId } = req.params;

    // content is loaded only to compute summaryStatus, then left out
    const chapters = await Chapter.find({ workId }).select('-contentHtml -draftHistory').sort({ order: 1 });
    res.json(
      chapters.map((ch) => {
        const json = ch.toJSON();
        json.summaryStatus = summaryStatus(json);
        delete json.content;
        return json;
      })
    );
```

- [ ] **Step 3: Stop the generic PUT from writing `summary`**

In `PUT /:chapterId`, next to the existing `delete setFields.draftHistory;`, add:

```js
    delete setFields.summary;
```

- [ ] **Step 4: Add the summary endpoints**

Add above `// DELETE /api/works/:workId/chapters/:chapterId`:

```js
function summaryResponse(chapter) {
  const json = chapter.toJSON ? chapter.toJSON() : chapter;
  return { summary: json.summary, summaryStatus: summaryStatus(json) };
}

// PUT /api/works/:workId/chapters/:chapterId/summary — the writer's edit
router.put('/:chapterId/summary', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const { text } = req.body || {};
    if (typeof text !== 'string') return next(httpError(400, 'MISSING_FIELD', 'text is required'));

    const chapter = await Chapter.findOne({ _id: chapterId, workId }).select('content');
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const trimmed = text.trim();
    const summary = trimmed
      ? { text: trimmed, sourceHash: hashContent(chapter.content), generatedAt: null, edited: true }
      : { text: '', sourceHash: '', generatedAt: null, edited: false };

    const updated = await Chapter.findOneAndUpdate(
      { _id: chapterId, workId },
      { $set: { summary } },
      { new: true }
    ).select('content summary');
    res.json(summaryResponse(updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters/:chapterId/summary/regenerate
router.post('/:chapterId/summary/regenerate', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId }).select('number title content summary').lean();
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    if (!chapter.content || !chapter.content.trim()) {
      return next(httpError(400, 'EMPTY_CHAPTER', 'This chapter has no text to summarise'));
    }

    // Regenerating hands the summary back to the AI
    await Chapter.updateOne({ _id: chapterId, workId }, { $set: { 'summary.edited': false } });
    await generateSummary(req.work, chapter);

    const updated = await Chapter.findOne({ _id: chapterId, workId }).select('content summary');
    res.json(summaryResponse(updated));
  } catch (err) {
    if (err.code === 'NO_API_KEY') return next(httpError(400, 'NO_API_KEY', err.message));
    if (err.code === 'EMPTY_SUMMARY') return next(httpError(502, 'EMPTY_SUMMARY', 'The AI returned an empty summary'));
    next(err);
  }
});
```

- [ ] **Step 5: Syntax-check and commit**

Run: `cd server && node --check src/routes/chapters.js && npm test`
Expected: no errors; tests PASS.

```bash
git add server/src/routes/chapters.js
git commit -m "feat: add chapter summary endpoints and summary status in chapter list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Story context on the AI routes

**Files:**
- Modify: `server/src/routes/ai.js`

**Interfaces:**
- Consumes: `buildContext` (Task 4), `loadWorkFromBody({ optional })` (existing).
- Produces: AI responses gain `context` (the manifest) when context was built:
  - `POST /ai/hooks` → `{ hooks, context? }` (context only with `workId`)
  - `POST /ai/rekindler` → `{ lastScene, toneNote, voiceSample, characterMood, context }`
  - `POST /ai/beat-suggest` → `{ suggestedBeat, rationale, writingPrompt, context? }`
  - `POST /ai/pacing` → `{ overall, flags, context }`
  - `POST /ai/polish-draft` (now requires `workId`; optional `chapterId`) → `{ polished, context }`
  - `POST /ai/editor-review` (now requires `workId`; optional `chapterId`) → `{ mode, summary, flags, context }`
  - `POST /ai/codex-audit` → `{ summary, findings, context }`
  - `POST /ai/codex-suggest` (now requires `workId`) → `{ suggestions, context }`
  - `tension-infer` and wizard `hooks` (no `workId`) are unchanged.

- [ ] **Step 1: Add the import and helpers**

In `server/src/routes/ai.js`, add:

```js
import { buildContext } from '../services/storyContextService.js';
```

and after `handleLlmError`:

```js
// Builds story context for a route; routes without a work get none
async function contextFor(req, needs, sourceText = '') {
  if (!req.work) return { text: '', manifest: null };
  const chapterId = typeof req.body.chapterId === 'string' ? req.body.chapterId : undefined;
  return buildContext({ work: req.work, chapterId, sourceText, needs });
}

function withContext(context, prompt) {
  return context.text ? `${context.text}\n\n${prompt}` : prompt;
}

function respond(res, body, context) {
  res.json(context.manifest ? { ...body, context: context.manifest } : body);
}
```

`handleLlmError` already maps `NO_API_KEY`, so errors thrown by `buildContext` need no extra handling.

- [ ] **Step 2: hooks**

In `POST /hooks`, after `const scene = …`, add:

```js
    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      scene
    );
```

change the `complete` call's `prompt` to `withContext(context, prompt)`, and replace `res.json({ hooks });` with `respond(res, { hooks }, context);`.

- [ ] **Step 3: rekindler**

In `POST /rekindler`, change the chapter query's `.select('title content')` to `.select('_id title content')`, and after `const lastContent = …` add:

```js
    req.body.chapterId = chapter?._id;
    const context = await contextFor(req, { story: true, summaries: 'before', mapBeat: true });
```

Use `withContext(context, prompt)` in `complete`, and replace `res.json(result);` with `respond(res, result, context);`.

- [ ] **Step 4: beat-suggest**

Change the handler signature to `router.post('/beat-suggest', loadWorkFromBody({ optional: true }), async (req, res, next) => {`, add before the `complete` call:

```js
    const context = await contextFor(req, { story: true, summaries: 'all' });
```

Use `withContext(context, prompt)` and replace `res.json(result);` with `respond(res, result, context);`.

- [ ] **Step 5: pacing**

In `POST /pacing`:

- Leave the `chapterSummary` JSON (ids, titles, word counts, tension, beat) as it is.
- Before the `complete` call add:

```js
    const context = await contextFor(req, { story: true, summaries: 'all' });
```

- Use `withContext(context, prompt)` and replace `res.json(result);` with `respond(res, result, context);`.

The chapter summaries arrive through the context block's "Story so far"; the existing JSON keeps the ids the AI must return in `chapterIds`.

- [ ] **Step 6: polish-draft**

Change the signature to `router.post('/polish-draft', loadWorkFromBody(), async (req, res, next) => {`. After the `content` check add:

```js
    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      content
    );
```

Use `withContext(context, prompt)` in `complete`, and replace `res.json({ polished });` with `respond(res, { polished }, context);`.

- [ ] **Step 7: editor-review**

Change the signature to `router.post('/editor-review', loadWorkFromBody(), async (req, res, next) => {`. After `if (!prompt) return …` add:

```js
    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      content
    );
```

Use `withContext(context, prompt)` in `complete`, and replace `res.json({ mode, ...result });` with `respond(res, { mode, ...result }, context);`.

- [ ] **Step 8: codex-audit and codex-suggest**

`codex-audit`: before its `complete` call add `const context = await contextFor(req, { story: true });`, use `withContext(context, prompt)`, and replace the final `res.json(result);` with `respond(res, result, context);` (leave the empty-codex early return unchanged).

`codex-suggest`: change the signature to `router.post('/codex-suggest', loadWorkFromBody(), async (req, res, next) => {`, add `const context = await contextFor(req, { story: true });` after `if (!prompt) return …`, use `withContext(context, prompt)`, and replace `res.json(result);` with `respond(res, result, context);`.

- [ ] **Step 9: Syntax-check and commit**

Run: `cd server && node --check src/routes/ai.js && npm test`
Expected: no errors; tests PASS. Also run `grep -n "withContext(context, prompt)" src/routes/ai.js | wc -l` → expected `8`.

```bash
git add server/src/routes/ai.js
git commit -m "feat: ground AI routes in shared story context

Polish, editor review and codex suggestions now require workId and get
the same ownership check as the other routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ContextUsed line and client request changes

**Files:**
- Create: `client/src/utils/summaryStatus.js`
- Create: `client/src/components/panel/ContextUsed.jsx`
- Modify: `client/src/components/panel/QuillTab.jsx`
- Modify: `client/src/components/overlays/DraftPolishModal.jsx`
- Modify: `client/src/components/overlays/EditorReviewModal.jsx`
- Modify: `client/src/components/overlays/CodexAuditModal.jsx`
- Modify: `client/src/components/codex/CodexSuggestPanel.jsx`, `CharacterSheet.jsx`, `PlaceEntry.jsx`, `RuleDetail.jsx`
- Modify: `client/src/components/map/ChapterDetail.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: response `context` manifest (Task 6); chapter list `summaryStatus` (Task 5).
- Produces:
  - `SUMMARY_STATUS_LABELS: Record<status, string>`
  - `summaryRefreshPending(chapters, chapterId, scope: 'before'|'all'): boolean`
  - `<ContextUsed context={manifest} />` — renders nothing when `context` is falsy.

- [ ] **Step 1: Status helpers**

Create `client/src/utils/summaryStatus.js`:

```js
export const SUMMARY_STATUS_LABELS = {
  none: 'No summary yet',
  current: 'Up to date',
  outdated: 'Outdated — refreshes on next AI use',
  edited: 'Edited by you',
  'edited-outdated': 'Edited by you; chapter changed since',
};

// True when an AI call would have to (re)make summaries first, so the UI
// can say why it's slower
export function summaryRefreshPending(chapters, chapterId, scope) {
  const list = chapters || [];
  const current = list.find((c) => c.id === chapterId);
  const targets =
    scope === 'all' ? list : current ? list.filter((c) => c.order < current.order) : [];
  return targets.some(
    (c) => (c.wordCount || 0) > 0 && (c.summaryStatus === 'none' || c.summaryStatus === 'outdated')
  );
}

export function loadingLabel(pending) {
  return pending ? 'Thinking… (updating chapter summaries)' : 'Thinking…';
}
```

- [ ] **Step 2: ContextUsed component**

Create `client/src/components/panel/ContextUsed.jsx`:

```jsx
import { useState } from 'react';

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ContextUsed({ context }) {
  const [open, setOpen] = useState(false);
  if (!context) return null;

  const parts = [];
  if (context.story) parts.push('story details');
  if (context.summaries) parts.push(plural(context.summaries, 'chapter summary', 'chapter summaries'));
  if (context.codex?.length) parts.push(plural(context.codex.length, 'Codex entry', 'Codex entries'));
  if (context.rules) parts.push(plural(context.rules, 'rule', 'rules'));
  if (context.beat) parts.push(`Beat: ${context.beat}`);

  const hasDetails = context.codex?.length > 0 || context.act || context.beat;

  return (
    <div className="context-used">
      <button
        className="context-used-line"
        onClick={() => hasDetails && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!hasDetails}
      >
        Context: {parts.join(' · ') || 'none'}
        {hasDetails && <span className="context-used-toggle">{open ? ' ▴' : ' ▾'}</span>}
      </button>
      {context.unavailable > 0 && (
        <p className="context-used-warning">
          {plural(context.unavailable, "summary couldn't be made", "summaries couldn't be made")} — those chapters were sent by title only.
        </p>
      )}
      {open && (
        <div className="context-used-details">
          {context.codex?.length > 0 && <p>Codex: {context.codex.join(', ')}</p>}
          {(context.act || context.beat) && (
            <p>Map: {[context.act, context.beat].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Styles**

Append to `client/src/index.css`:

```css
/* ============================================================
   Context Used
   ============================================================ */
.context-used {
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.context-used-line {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.context-used-line:disabled { cursor: default; }
.context-used-line:not(:disabled):hover { color: var(--text-muted); }

.context-used-warning {
  margin-top: 0.2rem;
  color: var(--amber);
}

.context-used-details {
  margin-top: 0.3rem;
  color: var(--text-muted);
  line-height: 1.5;
}
```

- [ ] **Step 4: QuillTab**

In `client/src/components/panel/QuillTab.jsx`:

1. Add imports:

```jsx
import ContextUsed from './ContextUsed.jsx';
import { summaryRefreshPending, loadingLabel } from '../../utils/summaryStatus.js';
```

2. In `handlePolishDraft`, change the call to:

```jsx
    const data = await call('polish-draft', {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content,
    });
    if (data?.polished) {
      setPolishedDraft({ text: data.polished, context: data.context });
    }
```

3. In `handleEditorReview`, change the call to:

```jsx
    const data = await call('editor-review', {
      workId,
      chapterId: editorState.chapterId,
      content: editorState.content,
      mode,
    });
```

4. Replace `{loading && <p className="panel-loading">Thinking…</p>}` with:

```jsx
      {loading && (
        <p className="panel-loading">
          {loadingLabel(
            summaryRefreshPending(workState.chapters, editorState.chapterId, aiAction === 'pacing' ? 'all' : 'before')
          )}
        </p>
      )}
```

5. Inside the `ai-result` block, after the hooks list and before the block's closing `</div>`, add:

```jsx
          {(aiAction === 'pacing' || aiAction === 'hooks') && <ContextUsed context={result.context} />}
```

(Polish and editor review show their context in their own modals, so it isn't repeated in the panel.)

6. Change the Polish modal usage to pass the new shape:

```jsx
      {polishedDraft && (
        <DraftPolishModal
          polished={polishedDraft.text}
          context={polishedDraft.context}
          onDismiss={() => setPolishedDraft(null)}
        />
      )}
```

7. In `RekindlerCard`, add `<ContextUsed context={snapshot.context} />` after the `rekindler-time` paragraph, and import is already added.

- [ ] **Step 5: Modals**

`DraftPolishModal.jsx`: change the signature to `export default function DraftPolishModal({ polished, context, onDismiss }) {`, add `import ContextUsed from '../panel/ContextUsed.jsx';`, and add `<ContextUsed context={context} />` right after `<pre className="draft-polish-preview">{polished}</pre>`.

`EditorReviewModal.jsx`: add the same import, change `const { mode, summary, flags = [] } = review;` to `const { mode, summary, flags = [], context } = review;`, and add `<ContextUsed context={context} />` as the last child of the modal body element (the one containing `editor-review-summary`).

`CodexAuditModal.jsx`: add the import, change `const { summary, findings = [] } = audit;` to `const { summary, findings = [], context } = audit;`, and add `<ContextUsed context={context} />` as the last child of `<div className="codex-audit-body">`.

- [ ] **Step 6: Codex suggestions**

`CodexSuggestPanel.jsx`: change the signature to `export default function CodexSuggestPanel({ workId, entityType, entity }) {`, add `import ContextUsed from '../panel/ContextUsed.jsx';` and `const [context, setContext] = useState(null);`, and change `handleSuggest` to:

```jsx
  async function handleSuggest() {
    setSuggestions(null);
    setContext(null);
    const data = await call('codex-suggest', { workId, entityType, entity });
    if (data?.suggestions) {
      setSuggestions(data.suggestions);
      setContext(data.context || null);
    }
  }
```

Add `<ContextUsed context={context} />` right after the `codex-suggest-list` div.

Pass `workId` from each parent:
- `CharacterSheet.jsx`: `<CodexSuggestPanel workId={workId} entityType="character" entity={char} />`
- `PlaceEntry.jsx`: `<CodexSuggestPanel workId={workId} entityType="place" entity={entry} />`
- `RuleDetail.jsx`: `<CodexSuggestPanel workId={workId} entityType="worldRule" entity={r} />`

- [ ] **Step 7: Map pacing**

In `client/src/components/map/ChapterDetail.jsx`, add `import ContextUsed from '../panel/ContextUsed.jsx';` and add `<ContextUsed context={aiResult.context} />` after `<PacingResult result={aiResult} chapters={chapters} />`.

- [ ] **Step 8: Build and commit**

Run: `cd client && npx vite build`
Expected: `✓ built`.

```bash
git add client/src/utils/summaryStatus.js client/src/components/panel/ContextUsed.jsx client/src/components/panel/QuillTab.jsx client/src/components/overlays/DraftPolishModal.jsx client/src/components/overlays/EditorReviewModal.jsx client/src/components/overlays/CodexAuditModal.jsx client/src/components/codex/CodexSuggestPanel.jsx client/src/components/codex/CharacterSheet.jsx client/src/components/codex/PlaceEntry.jsx client/src/components/codex/RuleDetail.jsx client/src/components/map/ChapterDetail.jsx client/src/index.css
git commit -m "feat: show the story context each AI result used

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Summary modal and Map summary

**Files:**
- Create: `client/src/components/overlays/ChapterSummaryModal.jsx`
- Modify: `client/src/components/editor/Toolbar.jsx`
- Modify: `client/src/components/map/ChapterDetail.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: summary endpoints (Task 5), `SUMMARY_STATUS_LABELS` (Task 7), `useActiveWork()` → `{ state.chapters, refreshChapters(workId) }`.
- Produces: `<ChapterSummaryModal workId chapterId onDismiss />`.

- [ ] **Step 1: Summary modal**

Create `client/src/components/overlays/ChapterSummaryModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { SUMMARY_STATUS_LABELS } from '../../utils/summaryStatus.js';

export default function ChapterSummaryModal({ workId, chapterId, onDismiss }) {
  const { state, refreshChapters } = useActiveWork();
  const chapter = state.chapters.find((c) => c.id === chapterId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'regenerate'
  const [error, setError] = useState(null);

  // The list's status is computed from saved text, so refresh on open
  useEffect(() => {
    refreshChapters(workId);
  }, [workId, refreshChapters]);

  const text = chapter?.summary?.text || '';
  const status = chapter?.summaryStatus || 'none';

  async function run(kind, request) {
    setBusy(kind);
    setError(null);
    try {
      await request();
      await refreshChapters(workId);
      setEditing(false);
    } catch (err) {
      setError(
        err.message === 'NO_API_KEY'
          ? 'No API key configured. Please go to Settings to add your API key.'
          : err.message
      );
    } finally {
      setBusy(null);
    }
  }

  const base = `/works/${workId}/chapters/${chapterId}/summary`;
  const handleSave = () => run('save', () => api.put(base, { text: draft }));
  const handleRegenerate = () => run('regenerate', () => api.post(`${base}/regenerate`, {}));

  return (
    <div
      className="modal-backdrop draft-polish-backdrop"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="modal chapter-summary-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Chapter Summary</h2>
            <p className="draft-polish-subtitle">
              AI help uses this to remember what happened in {chapter ? `“${chapter.title}”` : 'this chapter'}.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body">
          <p className={`summary-status summary-status--${status}`}>{SUMMARY_STATUS_LABELS[status]}</p>
          {editing ? (
            <textarea
              className="form-textarea chapter-summary-textarea"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          ) : (
            <p className="chapter-summary-text">{text || 'No summary yet. One is made the next time AI help needs this chapter, or generate it now.'}</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={handleRegenerate}
            disabled={Boolean(busy) || !chapter?.wordCount}
            title={chapter?.wordCount ? 'Replace with a fresh AI summary' : 'Write some of this chapter first'}
          >
            {busy === 'regenerate' ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
          <div className="modal-footer-right">
            {editing ? (
              <>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={Boolean(busy)}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDraft(text);
                  setEditing(true);
                }}
                disabled={Boolean(busy)}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Toolbar button**

In `client/src/components/editor/Toolbar.jsx`:

- Add `import ChapterSummaryModal from '../overlays/ChapterSummaryModal.jsx';`
- Add state `const [summaryOpen, setSummaryOpen] = useState(false);`
- After the History button add:

```jsx
      <button
        className="toolbar-btn toolbar-spark"
        onClick={() => setSummaryOpen(true)}
        disabled={!editorState.chapterId}
        title="View or edit the summary AI help uses for this chapter"
      >
        ☰ Summary
      </button>
```

- After the `historyOpen &&` block add:

```jsx
      {summaryOpen && (
        <ChapterSummaryModal
          workId={workId}
          chapterId={editorState.chapterId}
          onDismiss={() => setSummaryOpen(false)}
        />
      )}
```

- [ ] **Step 3: Map summary (read-only)**

In `client/src/components/map/ChapterDetail.jsx`, add `import { SUMMARY_STATUS_LABELS } from '../../utils/summaryStatus.js';` and insert above the Notes field (`<label className="chapter-detail-label">Notes / Summary</label>` block):

```jsx
        <div className="chapter-detail-field">
          <label className="chapter-detail-label">
            Chapter summary{' '}
            <span className={`summary-status summary-status--${chapter.summaryStatus || 'none'}`}>
              {SUMMARY_STATUS_LABELS[chapter.summaryStatus || 'none']}
            </span>
          </label>
          <p className="chapter-summary-text">{chapter.summary?.text || '—'}</p>
        </div>
```

and rename that existing Notes label text from `Notes / Summary` to `Notes`.

- [ ] **Step 4: Styles**

Append to `client/src/index.css`:

```css
/* ============================================================
   Chapter Summary
   ============================================================ */
.chapter-summary-modal {
  max-width: 600px;
}

.summary-status {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
  font-weight: normal;
}
.summary-status--current { color: var(--success); }
.summary-status--outdated,
.summary-status--edited-outdated { color: var(--amber); }
.summary-status--edited { color: var(--gold); }

.chapter-summary-text {
  margin-top: 0.5rem;
  font-family: Georgia, serif;
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
}

.chapter-summary-textarea {
  margin-top: 0.5rem;
  width: 100%;
}
```

- [ ] **Step 5: Build and commit**

Run: `cd client && npx vite build`
Expected: `✓ built`.

```bash
git add client/src/components/overlays/ChapterSummaryModal.jsx client/src/components/editor/Toolbar.jsx client/src/components/map/ChapterDetail.jsx client/src/index.css
git commit -m "feat: add chapter summary modal and show summaries on the Map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end verification

**Files:**
- No committed files. Scratch scripts go in the session scratchpad; the temporary Vite config (`client/vite.verify.config.js`) is deleted afterwards.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start a throwaway stack with the fake provider**

```bash
docker run -d --rm --name scriptorium-verify-mongo -p 27018:27017 docker.io/library/mongo:8
cd server && PORT=3011 NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake \
  MONGODB_URI=mongodb://localhost:27018/scriptorium_verify \
  DEV_AUTH_BYPASS=true ADMIN_EMAIL=dev@localhost node src/server.js   # run in background
```

Expected log: `Connected to MongoDB`, `DEV AUTH BYPASS ENABLED`, `listening on http://localhost:3011`.

Note: `DEV_AUTH_BYPASS` only requires `NODE_ENV !== 'production'`, so it works with `NODE_ENV=test`.

- [ ] **Step 2: API checks**

With `B=http://localhost:3011/api` and a JSON helper `j() { curl -s -H 'Content-Type: application/json' "$@"; }`:

1. Create a work (`POST $B/works` with title, genre, POV, premise) and three chapters; `PUT` content into chapters 1 and 2 (chapter 2 mentions `Zoë` and `The Grey`), leave chapter 3 with text mentioning nothing. Create a Codex character `{"name":"Mara","aliases":"The Grey, Lady M"}`, a character `{"name":"Zoë"}`, and a rule `{"category":"magic","rule":"Bells bind oaths"}`. Set Map data for chapter 3: `{"act":"Act II","beat":"Midpoint"}`.
2. `GET $B/works/$WID/chapters` → each chapter has `summaryStatus` (`none` for 1–2, `none` for 3), and no `content` key.
3. `POST $B/ai/polish-draft` with `{"workId":WID,"chapterId":CH3,"content":"Mara and Zoë wait."}` →
   - `polished` starts with `ECHO` and contains `<story_context>`, `Ch. 1 —`, `Ch. 2 —`, `Fake summary of Chapter`, `- Mara (aka The Grey, Lady M)`, `- Zoë`, `[magic] Bells bind oaths`, `Act II · Beat: Midpoint`, and does **not** contain `Ch. 3 —`.
   - `context` equals `{ story: true, summaries: 2, unavailable: 0, codex: [...Mara, Zoë in some order], rules: 1, act: 'Act II', beat: 'Midpoint' }`.
4. `GET` chapters again → chapters 1 and 2 are `current`.
5. `PUT` new content into chapter 1 → its status is `outdated`; repeat step 3 → chapter 1 regenerates (status `current` again afterwards).
6. `PUT $B/works/$WID/chapters/$CH1/summary` `{"text":"My own summary."}` → `summaryStatus: "edited"`; change chapter 1's content → `edited-outdated`; repeat step 3 → `polished` contains `My own summary.` (not regenerated).
7. `POST …/$CH1/summary/regenerate` → `summaryStatus: "current"`, text starts `Fake summary`.
8. `POST …/$CH3/summary/regenerate` after clearing chapter 3's content → `400 EMPTY_CHAPTER`.
9. **Foreign chapterId (Review Focus 5):** seed another user's work and chapter in Mongo (`docker exec scriptorium-verify-mongo mongosh -quiet scriptorium_verify --eval 'db.works.insertOne({_id:"work_other",ownerId:"user_someone",title:"Secret"}); db.chapters.insertOne({_id:"ch_secret",workId:"work_other",title:"Secret ch",number:1,order:0,content:"secret text"})'`). Then:
   - `polish-draft` with `{"workId":WID,"chapterId":"ch_secret","content":"x"}` → 200; `polished` has no `Story so far`, no `Secret`; `context.summaries` is 0 and `beat` is null.
   - `polish-draft` / `editor-review` / `codex-suggest` / `pacing` with `{"workId":"work_other",…}` → `404 NOT_FOUND`.
   - `polish-draft` without `workId` → `400 MISSING_FIELD`.
10. `POST $B/ai/pacing` `{"workId":WID}` → `context.summaries` is 2 (chapter 3 was emptied in check 8, so only chapters 1–2 are summarised); `POST $B/ai/hooks` without `workId` → `{ hooks }` with no `context` key.
11. **Save guards (edit race):** the fake provider is too fast to race through HTTP, so call `generateSummary` directly against the throwaway DB with `CH2` set to chapter 2's id:

```bash
cd server && CH2=<chapter 2 id> NODE_ENV=test LLM_PROVIDER_OVERRIDE=fake node --input-type=module -e "
import mongoose from 'mongoose';
import Chapter from './src/models/Chapter.js';
import { generateSummary } from './src/services/summaryService.js';
await mongoose.connect('mongodb://localhost:27018/scriptorium_verify');
const id = process.env.CH2;
const work = { _id: 'unused', ownerId: 'user_dev', title: 'T' };

// 1. Content changed after generation started: must not save
let before = await Chapter.findById(id).lean();
await generateSummary(work, { ...before, content: before.content + ' (stale copy)' });
let after = await Chapter.findById(id).lean();
console.log(JSON.stringify(after.summary) === JSON.stringify(before.summary) ? 'STALE GUARD OK' : 'STALE GUARD FAILED');

// 2. Writer edited the summary meanwhile: must not save
await Chapter.updateOne({ _id: id }, { \$set: { 'summary.text': 'Writer edit', 'summary.edited': true } });
before = await Chapter.findById(id).lean();
await generateSummary(work, before);
after = await Chapter.findById(id).lean();
console.log(after.summary.text === 'Writer edit' ? 'EDIT GUARD OK' : 'EDIT GUARD FAILED');
await mongoose.disconnect();"
```

Expected output: `STALE GUARD OK` and `EDIT GUARD OK`.

All checks must pass; record any failure and fix it in the owning task's files with a new commit.

- [ ] **Step 3: Browser checks**

Create `client/vite.verify.config.js` from `client/vite.config.js`, with the proxy target changed to `http://localhost:3011` and the port changed to `5183`. Run `npx vite --config vite.verify.config.js` from `client/` in the background, then in the browser:

1. Open `/work/$WID/chapter/$CH3`; click **☰ Summary** → status label shows; **Generate**/**Regenerate** works; **Edit → Save** shows "Edited by you".
2. Quill → **Polish this draft** → modal shows the echo and a `Context: story details · 2 chapter summaries · 2 Codex entries · 1 rule · Beat: Midpoint` line; clicking it expands Codex names and `Act II · Midpoint`.
3. Make chapter 1 outdated, click **Polish** again → loading text reads `Thinking… (updating chapter summaries)`.
4. Map → select chapter 1 → summary shown read-only with its status label above Notes; **Analyse Pacing** shows a Context line.
5. Codex → **◆ AI Suggestions** on a character and **◈ Codex Audit** both show a Context line.
6. No console errors.

- [ ] **Step 4: Clean up**

```bash
rm -f client/vite.verify.config.js
docker stop scriptorium-verify-mongo
# stop the background server and vite processes
git status --short   # expected: clean
```

- [ ] **Step 5: Run the unit tests one final time**

Run: `cd server && npm test`
Expected: all PASS.
