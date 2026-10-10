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
