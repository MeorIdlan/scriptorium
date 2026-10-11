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

// About 1.5 tokens per word, ~16 tokens of [[tN]]…[[/tN]] markers per target,
// plus headroom, so a full request can't be cut off
export function maxTokensFor(words, targetCount = 0) {
  // integer math: 100 * 2.2 isn't exactly 220
  return Math.min(8000, Math.ceil((words * 22) / 10) + targetCount * 16 + 200);
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
