const ENTRY_MAX = 400;
const CODEX_BUDGET = 8000;
const CATCH_MAX = 300;
export const MAX_CONTEXT_CATCHES = 10;
const THREAD_MAX = 300;
export const MAX_CONTEXT_THREADS = 8;
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}_]';

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

// Whole-word, case-insensitive; Unicode-aware because \b only knows ASCII.
// Both sides are NFC-normalized and straight/curly apostrophes are treated
// alike, since pasted prose often differs from what was typed in the Codex.
export function countMentions(term, text) {
  if (!nonBlank(term) || !text) return 0;
  const pattern = escapeRegex(term.trim().normalize('NFC')).replace(/['’]/g, "['’]");
  const re = new RegExp(`(?<!${WORD_CHAR})${pattern}(?!${WORD_CHAR})`, 'giu');
  return (text.normalize('NFC').match(re) || []).length;
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

const SCENE_LINE_MAX = 200;
export const MAX_SCENE_LINES = 30;

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// The card of the scene the writer is working in
function sceneSection(scene) {
  if (!scene || ![scene.title, scene.pov, scene.location, scene.summary].some(nonBlank)) return '';
  const lines = [['Title', scene.title], ['POV', scene.pov], ['Location', scene.location], ['Status', scene.status], ['Summary', scene.summary]]
    .filter(([, v]) => nonBlank(v))
    .map(([k, v]) => `${k}: ${oneLine(v)}`);
  return `## This scene\n${lines.join('\n')}`;
}

function sceneListSection(scenes) {
  const list = (scenes || []).filter((s) => s && typeof s === 'object');
  if (!list.some((s) => s.id)) return { text: '', count: 0 };
  const lines = list.slice(0, MAX_SCENE_LINES).map((s, i) => {
    let line = nonBlank(s.title) ? oneLine(s.title) : `Scene ${i + 1}`;
    if (nonBlank(s.pov)) line += ` (${oneLine(s.pov)})`;
    if (nonBlank(s.summary)) line += `: ${oneLine(s.summary)}`;
    return `- ${clip(line, SCENE_LINE_MAX)}`;
  });
  return { text: `## Scenes in this chapter\n${lines.join('\n')}`, count: lines.length };
}

// Open catches tagged to this chapter: ideas the writer meant to use here
function catchesSection(catches) {
  const lines = (catches || [])
    .map((c) => (typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_CONTEXT_CATCHES)
    .map((c) => `- ${clip(c, CATCH_MAX)}`);
  return {
    text: lines.length ? `## Writer's notes for this chapter\n${lines.join('\n')}` : '',
    count: lines.length,
  };
}

// Threads the writer tagged on this scene (or chapter), so suggestions stay on thread
function threadsSection(threads) {
  const kept = (threads || [])
    .filter((t) => t && typeof t === 'object' && nonBlank(t.name))
    .slice(0, MAX_CONTEXT_THREADS);
  const lines = kept.map((t) => {
    const head = `${oneLine(t.name)} (${t.status === 'resolved' ? 'resolved' : 'open'})`;
    return `- ${clip(nonBlank(t.description) ? `${head}: ${oneLine(t.description)}` : head, THREAD_MAX)}`;
  });
  return {
    text: lines.length ? `## Plot threads in play\n${lines.join('\n')}` : '',
    names: kept.map((t) => oneLine(t.name)),
  };
}

export function formatContextBlock({ story, summaries, mentions, rules, mapBeat, scene, sceneList, catches, threads }) {
  const codex = codexSection(mentions, rules);
  const thisScene = sceneSection(scene);
  const plotThreads = threadsSection(threads);
  const scenes = sceneListSection(sceneList);
  const notes = catchesSection(catches);
  const sections = [storySection(story), summariesSection(summaries), codex.text, mapSection(mapBeat), thisScene, plotThreads.text, scenes.text, notes.text].filter(Boolean);
  const text = sections.length ? `<story_context>\n${HEADER}\n\n${sections.join('\n\n')}\n</story_context>` : '';
  return {
    text,
    codexNames: codex.codexNames,
    rules: codex.rules,
    scene: Boolean(thisScene),
    sceneList: scenes.count,
    catches: notes.count,
    threads: plotThreads.names,
  };
}
