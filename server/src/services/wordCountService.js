import { readJSON, writeJSON } from './fileService.js';

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function recalculate(workId) {
  const chapters = readJSON(`works/${workId}/chapters.json`) || [];
  let total = 0;

  for (const entry of chapters) {
    const ch = readJSON(`works/${workId}/chapters/${entry.id}.json`);
    if (ch) {
      total += countWords(ch.content || '');
    }
  }

  const meta = readJSON(`works/${workId}/meta.json`);
  if (meta) {
    meta.wordCount = total;
    meta.updatedAt = new Date().toISOString();
    writeJSON(`works/${workId}/meta.json`, meta);

    // Sync to works index
    const works = readJSON('works.json') || [];
    const idx = works.findIndex((w) => w.id === workId);
    if (idx !== -1) {
      works[idx].wordCount = total;
      writeJSON('works.json', works);
    }
  }

  return total;
}
