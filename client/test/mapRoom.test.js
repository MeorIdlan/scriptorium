// The Map's gothic touches (card uqVctsf5): each chapter block carries its act colour as --act so the
// selected ring can use it, and the chapter detail wears the gold corner frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import ChapterBlocks from '../src/components/map/ChapterBlocks.jsx';
import ChapterDetail from '../src/components/map/ChapterDetail.jsx';
import CharacterSheet from '../src/components/codex/CharacterSheet.jsx';

const chapter = (over) => ({ id: 'c1', number: 1, title: 'One', act: 'Act I', wordCount: 1000, scenes: [], beat: 'x', ...over });

test('a block carries its act colour token as --act', async () => {
  const acts = { 'Act I': 'var(--teal)', 'Act II': 'var(--purple)', 'Act III': 'var(--coral)', none: 'var(--border-control)' };
  for (const [act, token] of Object.entries(acts)) {
    const view = await renderApp(h(ChapterBlocks, { chapters: [chapter({ act: act === 'none' ? undefined : act })] }));
    assert.match(view.query('.chapter-block').getAttribute('style'), new RegExp(`--act:\\s*${token.replace(/[()]/g, '\\$&')}`), act);
    await view.unmount();
  }
});

test('the long-text Codex field spans both sheet columns', async () => {
  const character = { id: 'k1', name: 'Ilse', role: 'Lead', notes: 'Counts steps.', flags: [] };
  const view = await renderApp(h(CharacterSheet, { workId: 'w1', character, onUpdate() {}, onFlagsChange() {} }));
  const wide = view.queryAll('.inline-field--wide');
  assert.ok(wide.length >= 1, 'no wide field on the character sheet');
  assert.match(wide[wide.length - 1].textContent, /Notes/);
  await view.unmount();
});

test('the chapter detail has the corner frame', async () => {
  const chapters = [{ id: 'c1', number: 1, title: 'One', wordCount: 900, beat: null, summaryStatus: 'none', scenes: [] }];
  const view = await renderApp(h(ChapterDetail, { workId: 'w1', chapterId: 'c1', chapters, onSaved() {} }));
  assert.ok(view.query('.chapter-detail').classList.contains('corners'));
  await view.unmount();
});
