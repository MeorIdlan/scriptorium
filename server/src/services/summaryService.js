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

// Save only if the chapter still has the text we summarised and (unless the
// writer asked to regenerate) hasn't edited the summary meanwhile
export function summarySaveFilter(chapter, { force = false } = {}) {
  const filter = { _id: chapter._id, content: chapter.content };
  if (!force) filter['summary.edited'] = { $ne: true };
  return filter;
}

// force: the writer asked to regenerate, so an edited summary may be replaced
export function generateSummary(work, chapter, { force = false } = {}) {
  const sourceHash = hashContent(chapter.content);
  const key = `${chapter._id}:${sourceHash}${force ? ':force' : ''}`;
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

    await Chapter.updateOne(
      summarySaveFilter(chapter, { force }),
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

// Summaries run before the main call, so cap the time they can take: the
// request has to fit inside the proxy timeouts in front of the server
const SUMMARY_BUDGET_MS = 45000;

// Errors that will fail every call the same way, including the main one
function isFatal(err) {
  return err.code === 'NO_API_KEY' || [401, 403, 404].includes(err.status);
}

export async function ensureSummaries(
  work,
  chapters,
  { generate = generateSummary, budgetMs = SUMMARY_BUDGET_MS, now = Date.now } = {}
) {
  const summaries = new Map();
  let unavailable = 0;
  const todo = [];

  for (const chapter of chapters) {
    if (!chapter.content || !chapter.content.trim()) continue;
    if (needsGeneration(chapter)) todo.push(chapter);
    else summaries.set(chapter._id, chapter.summary.text);
  }

  const deadline = now() + budgetMs;
  let stopped = false; // set after a rate limit: leave the budget for the main call

  await runLimited(todo, CONCURRENCY, async (chapter) => {
    if (stopped || now() >= deadline) {
      unavailable += 1;
      return;
    }
    try {
      summaries.set(chapter._id, await generate(work, chapter));
    } catch (err) {
      if (isFatal(err)) throw err;
      if (err.status === 429) stopped = true;
      console.error(`Summary generation failed for ${chapter._id}:`, err.message);
      unavailable += 1;
    }
  });

  return { summaries, unavailable };
}
