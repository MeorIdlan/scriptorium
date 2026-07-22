import Codex from '../models/Codex.js';

const TITLE_WORDS = ['Lady', 'Lord', 'Sir', 'Warden', 'General', 'Captain'];

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

export async function scan(workId, chapterId, content) {
  const codex = await Codex.findOne({ workId });
  if (!codex) return;

  for (const character of codex.characters || []) {
    const name = character.name;
    if (!name) continue;
    if (!content.includes(name)) continue;

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
      if (aliases.includes(titleWithName.toLowerCase())) continue;

      const alreadyFlagged = (character.flags || []).some(
        (f) => f.note && f.note.includes(titleWord)
      );
      if (alreadyFlagged) continue;

      const flag = {
        id: `flag_${shortId()}`,
        chapterId,
        note: `Title conflict: "${titleWithName}" found but not in aliases`,
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
