import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import ChapterDetail from '../src/components/map/ChapterDetail.jsx';

const chapters = [
  {
    id: 'c1',
    title: 'One',
    wordCount: 900,
    beat: 'Inciting Incident',
    summaryStatus: 'current',
    summary: { text: 'Mara leaves Harrowgate.' },
    scenes: [],
  },
];

function openChapter(ai) {
  return renderApp(h(ChapterDetail, { workId: 'w1', chapterId: 'c1', chapters, onSaved() {} }), { ai });
}

test('with AI off the chapter detail has no pacing analysis or summary', async () => {
  const view = await openChapter(false);
  assert.equal(view.hasButton('Analyse Pacing'), false);
  assert.doesNotMatch(view.text(), /Chapter summary/);
  assert.doesNotMatch(view.text(), /Mara leaves Harrowgate/);
  await view.unmount();
});

test('with AI off the chapter detail keeps its writing tools', async () => {
  const view = await openChapter(false);
  assert.ok(view.hasButton('Open in Main Room'));
  assert.match(view.text(), /Notes/);
  await view.unmount();
});

test('with AI on the chapter detail offers pacing analysis and shows the summary', async () => {
  const view = await openChapter(true);
  assert.ok(view.hasButton('Analyse Pacing'));
  assert.match(view.text(), /Mara leaves Harrowgate/);
  await view.unmount();
});
