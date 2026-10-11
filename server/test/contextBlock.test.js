import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAliases,
  countMentions,
  findMentions,
  formatContextBlock,
  MAX_CONTEXT_CATCHES,
  MAX_SCENE_LINES,
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
      // ties keep Codex order: characters, then places
      ['character', 'Tomas', 1],
      ['place', 'Vell Keep', 1],
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

test('countMentions treats straight and curly apostrophes alike', () => {
  assert.equal(countMentions("O'Brien", 'O’Brien waited.'), 1);
  assert.equal(countMentions('O’Brien', "O'Brien waited."), 1);
});

test('countMentions matches regardless of Unicode normalization', () => {
  const nfc = 'Zoë';
  const nfd = 'Zoë';
  assert.equal(countMentions(nfc, `${nfd} ran.`), 1);
  assert.equal(countMentions(nfd, `${nfc} ran.`), 1);
  assert.equal(countMentions(nfc, `${nfd}y ran.`), 0);
});

test('formatContextBlock renders writer notes after the Map section', () => {
  const out = formatContextBlock({
    story: { title: 'Bells' },
    summaries: [],
    mentions: [],
    rules: [],
    mapBeat: { act: 'Act I', beat: '', notes: '' },
    catches: ['She lies about the letter', 'Rain on the well'],
  });
  const t = out.text;
  assert.ok(t.includes("## Writer's notes for this chapter\n- She lies about the letter\n- Rain on the well"));
  assert.ok(t.indexOf('## This chapter on the Map') < t.indexOf("## Writer's notes for this chapter"));
  assert.equal(out.catches, 2);
});

test('writer notes are one line each, clipped to 300 characters, at most 10', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Note ${i}`);
  many[0] = 'Line one\n\n  line   two\tend';
  many[1] = 'x'.repeat(400);
  const out = formatContextBlock({ story: null, summaries: [], mentions: [], rules: [], mapBeat: null, catches: many });
  const lines = out.text.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(MAX_CONTEXT_CATCHES, 10);
  assert.equal(lines.length, 10);
  assert.equal(lines[0], '- Line one line two end');
  assert.equal(lines[1].length, 2 + 300);
  assert.ok(lines[1].endsWith('…'));
  assert.equal(out.catches, 10);
});

test('writer notes skip blank entries and add no section when none are left', () => {
  const out = formatContextBlock({ story: null, summaries: [], mentions: [], rules: [], mapBeat: null, catches: ['  ', '', null] });
  assert.equal(out.text, '');
  assert.equal(out.catches, 0);
  const none = formatContextBlock({ story: { title: 'T' }, summaries: [], mentions: [], rules: [], mapBeat: null });
  assert.ok(!none.text.includes("Writer's notes"));
  assert.equal(none.catches, 0);
});

test('formatContextBlock renders this scene without blank fields', () => {
  const out = formatContextBlock({ scene: { id: 'a', title: 'The well', pov: 'Mara', location: '', status: 'draft', summary: 'She  finds\nthe letter.' } });
  assert.match(out.text, /## This scene\nTitle: The well\nPOV: Mara\nStatus: draft\nSummary: She finds the letter\./);
  assert.ok(!out.text.includes('Location:'));
  assert.equal(out.scene, true);
});

test('formatContextBlock omits a scene card with only a status', () => {
  const out = formatContextBlock({ scene: { id: 'a', title: '', pov: ' ', location: '', status: 'draft', summary: '' } });
  assert.equal(out.text, '');
  assert.equal(out.scene, false);
});

test('formatContextBlock lists the chapter scenes, numbered when untitled, capped', () => {
  const scenes = [
    { id: null, title: '', pov: '', summary: '' },
    { id: 'b', title: 'Road', pov: 'Tam', summary: 'They leave.' },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, title: '', pov: '', summary: 'y'.repeat(300) })),
  ];
  const out = formatContextBlock({ sceneList: scenes });
  const lines = out.text.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(out.sceneList, MAX_SCENE_LINES);
  assert.equal(lines.length, MAX_SCENE_LINES);
  assert.equal(lines[0], '- Scene 1');
  assert.equal(lines[1], '- Road (Tam): They leave.');
  assert.ok(lines[2].length <= 202);
});

test('formatContextBlock omits the scene list for a chapter without markers', () => {
  const out = formatContextBlock({ sceneList: [] });
  assert.equal(out.sceneList, 0);
  assert.equal(out.text, '');
});
