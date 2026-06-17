import { readJSON, writeJSON } from './fileService.js';

const TITLE_WORDS = ['Lady', 'Lord', 'Sir', 'Warden', 'General', 'Captain'];

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

export function scan(workId, chapterId, content) {
  const codex = readJSON(`works/${workId}/codex.json`);
  if (!codex) return;

  let changed = false;

  for (const character of codex.characters || []) {
    const name = character.name;
    if (!name) continue;

    // Check if character's name appears in the content
    if (!content.includes(name)) continue;

    // Search near the name for title words
    const regex = new RegExp(
      `(${TITLE_WORDS.join('|')})\\s+${escapeRegex(name)}|${escapeRegex(name)}\\s+(${TITLE_WORDS.join('|')})`,
      'gi'
    );

    const matches = [...content.matchAll(regex)];
    if (matches.length === 0) continue;

    const aliases = (character.aliases || []).map((a) => a.toLowerCase());

    for (const match of matches) {
      const titleWord = (match[1] || match[2] || '').trim();
      const titleWithName = `${titleWord} ${name}`;

      // Skip if this title+name combo is already in aliases
      if (aliases.includes(titleWithName.toLowerCase())) continue;

      // Ensure flags array exists
      if (!character.flags) character.flags = [];

      // Avoid duplicate flags
      const alreadyFlagged = character.flags.some(
        (f) => f.note && f.note.includes(titleWord)
      );
      if (alreadyFlagged) continue;

      character.flags.push({
        id: `flag_${shortId()}`,
        chapterId,
        note: `Title conflict: "${titleWithName}" found but not in aliases`,
        status: 'unresolved',
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) {
    writeJSON(`works/${workId}/codex.json`, codex);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
