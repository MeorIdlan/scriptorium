import Codex from '../models/Codex.js';
import { normalizeAliases } from './contextBlock.js';

const TITLE_WORDS = ['Lady', 'Lord', 'Sir', 'Warden', 'General', 'Captain'];

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// Title words found next to the character's name ("Lady Mara", "Mara
// Captain") that aren't recorded as aliases, in order of first appearance
export function titleConflicts(character, content) {
  const name = character.name;
  if (!name || !content || !content.includes(name)) return [];

  const regex = new RegExp(
    `(${TITLE_WORDS.join('|')})\\s+${escapeRegex(name)}|${escapeRegex(name)}\\s+(${TITLE_WORDS.join('|')})`,
    'gi'
  );
  const aliases = normalizeAliases(character.aliases).map((a) => a.toLowerCase());
  const conflicts = [];
  for (const match of content.matchAll(regex)) {
    const titleWord = (match[1] || match[2] || '').trim();
    if (aliases.includes(`${titleWord} ${name}`.toLowerCase())) continue;
    if (!conflicts.includes(titleWord)) conflicts.push(titleWord);
  }
  return conflicts;
}

export async function scan(workId, chapterId, content) {
  const codex = await Codex.findOne({ workId });
  if (!codex) return;

  for (const character of codex.characters || []) {
    for (const titleWord of titleConflicts(character, content)) {
      const alreadyFlagged = (character.flags || []).some(
        (f) => f.note && f.note.includes(titleWord)
      );
      if (alreadyFlagged) continue;

      const flag = {
        id: `flag_${shortId()}`,
        chapterId,
        note: `Title conflict: "${titleWord} ${character.name}" found but not in aliases`,
        status: 'unresolved',
        createdAt: new Date().toISOString(),
      };

      await Codex.updateOne(
        { workId, 'characters.id': character.id },
        { $push: { 'characters.$.flags': flag } }
      );
      character.flags = [...(character.flags || []), flag];
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
