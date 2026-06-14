// Prompt assembly + parsing helpers for Chapter Summaries and Story Memories.
// Kept out of components, mirroring lib/promptBuilder.js.

export const MEMORY_BATCH_SIZE = 4;

export const MEMORY_CATEGORIES = [
  "Characters",
  "Plot Threads",
  "World",
  "Timeline",
  "General",
];

// ── Chapter summarization ──────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `You are a story-continuity assistant. You write tight, factual chapter summaries that another writer (or AI) can read before drafting the next chapter.

Capture:
- Key plot events in order
- Where each significant character ends up (location, emotional state, knowledge)
- Unresolved threads, mysteries, and promises that must pay off later
- Any important world/timeline details introduced

Write a single dense paragraph of roughly 120–180 words. No headings, no bullet points, no preamble — just the summary prose.`;

export function buildChapterSummaryPrompt({ chapter, chapterNumber, priorSummaries }) {
  const parts = [];
  if (priorSummaries && priorSummaries.length > 0) {
    parts.push("Summaries of earlier chapters (for continuity — do NOT re-summarize these):");
    priorSummaries.forEach((s, i) => {
      if (s && s.trim()) parts.push(`Chapter ${i + 1}: ${s.trim()}`);
    });
    parts.push("");
  }
  const label = chapterNumber ? `Chapter ${chapterNumber}` : "this chapter";
  parts.push(`Summarize ${label}${chapter.title ? ` ("${chapter.title}")` : ""}:`);
  parts.push("");
  parts.push((chapter.content || "").trim() || "(This chapter has no content yet.)");

  return { systemPrompt: SUMMARY_SYSTEM_PROMPT, userMessage: parts.join("\n") };
}

// Flatten the summary prompt into a single copyable string for the no-AI path.
export function buildChapterSummaryCopyText(args) {
  const { systemPrompt, userMessage } = buildChapterSummaryPrompt(args);
  return `${systemPrompt}\n\n---\n\n${userMessage}`;
}

// ── Story Memories ─────────────────────────────────────────────────────

const MEMORY_SYSTEM_PROMPT = `You are a story-bible compiler. You maintain a living set of "memories" — concise, categorized notes about an ongoing story that a writer can use as an appendix when drafting future chapters.

You will be given:
- A DIRECTION describing what the writer wants the memories to focus on
- The CURRENT MEMORIES (may be empty)
- One BATCH of chapter text

Refine and extend the current memories using the new chapter text, following the direction. Merge related notes, update facts that changed, and add anything important that's missing. Keep each note concise and self-contained.

Return ONLY a JSON array. Each element is an object with exactly two string fields: "category" and "content". Use short category labels (e.g. "Characters", "Plot Threads", "World", "Timeline"). Return the COMPLETE updated memory list, not just the changes. No markdown, no code fences, no commentary — just the raw JSON array.`;

export function buildMemoryBatchPrompt({ direction, existingMemories, batchChapters, batchLabel }) {
  const parts = [];
  parts.push(`DIRECTION:\n${(direction || "").trim() || "Track characters, plot threads, world details, and timeline."}`);
  parts.push("");

  const existingJson = (existingMemories || []).map(m => ({ category: m.category, content: m.content }));
  parts.push(`CURRENT MEMORIES (JSON):\n${JSON.stringify(existingJson, null, 2)}`);
  parts.push("");

  if (batchLabel) parts.push(`CHAPTER BATCH — ${batchLabel}:`);
  else parts.push("CHAPTER BATCH:");
  batchChapters.forEach((c, i) => {
    parts.push("");
    parts.push(`## ${c.title || `Chapter ${i + 1}`}`);
    parts.push((c.content || "").trim() || "(empty)");
  });

  return { systemPrompt: MEMORY_SYSTEM_PROMPT, userMessage: parts.join("\n") };
}

// Tolerant parse of the model's JSON memory list. Falls back to a single entry.
export function parseMemoryEntries(text) {
  const raw = (text || "").trim();
  let jsonStr = raw;

  // Strip ```json ... ``` fences if present.
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Otherwise narrow to the outermost array brackets.
  if (!fenceMatch) {
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      const entries = parsed
        .filter(e => e && typeof e === "object" && (e.content ?? "").toString().trim())
        .map(e => makeMemory(
          (e.category ?? "General").toString().trim() || "General",
          e.content.toString().trim(),
          "ai",
        ));
      if (entries.length > 0) return entries;
    }
  } catch { /* fall through to fallback */ }

  if (!raw) return [];
  return [makeMemory("General", raw, "ai")];
}

let memorySeq = 0;
export function makeMemory(category, content, source = "manual") {
  memorySeq += 1;
  return {
    id: `${Date.now().toString(36)}-${memorySeq}`,
    category: category || "General",
    content: content || "",
    source,
    createdAt: new Date().toISOString(),
  };
}

// Split a story's chapters into batches for sequential processing.
export function batchChapters(chapters, size = MEMORY_BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < chapters.length; i += size) {
    batches.push({
      chapters: chapters.slice(i, i + size),
      label: `Chapters ${i + 1}–${Math.min(i + size, chapters.length)}`,
    });
  }
  return batches;
}

// ── Forge appendix ─────────────────────────────────────────────────────

// Build the appendix text appended to a Forge prompt when a story is linked.
export function buildForgeAppendix({ memories = [], summaries = [] }) {
  const sections = [];

  if (memories.length > 0) {
    const byCategory = {};
    memories.forEach(m => {
      const cat = m.category || "General";
      (byCategory[cat] = byCategory[cat] || []).push(m.content);
    });
    const lines = ["STORY BIBLE"];
    Object.entries(byCategory).forEach(([cat, items]) => {
      lines.push("");
      lines.push(`[${cat}]`);
      items.forEach(c => lines.push(`- ${c}`));
    });
    sections.push(lines.join("\n"));
  }

  const usableSummaries = summaries.filter(s => s && s.text && s.text.trim());
  if (usableSummaries.length > 0) {
    const lines = ["PREVIOUS CHAPTER SUMMARIES"];
    usableSummaries.forEach(s => {
      lines.push("");
      lines.push(`${s.label}: ${s.text.trim()}`);
    });
    sections.push(lines.join("\n"));
  }

  if (sections.length === 0) return "";
  return `\n\n---\nReference context — use this to stay consistent. Do not summarize or repeat it back; weave it naturally.\n\n${sections.join("\n\n")}`;
}
