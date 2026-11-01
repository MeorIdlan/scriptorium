import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { fieldByLabel } from './support/labels.js';
import ChapterDetail from '../src/components/map/ChapterDetail.jsx';

const chapters = [{
  id: 'c1', number: 1, title: 'One', wordCount: 900, beat: null, summaryStatus: 'none',
  scenes: [{ id: 's1', index: 0, title: 'Arrival', status: 'draft', wordCount: 400 }],
}];

function openChapter(options) {
  return renderApp(h(ChapterDetail, { workId: 'w1', chapterId: 'c1', chapters, onSaved() {} }), options);
}

test('the Map chapter fields are reached through their labels', async () => {
  const view = await openChapter();
  assert.equal(fieldByLabel(view.container, 'Tension Score').getAttribute('type'), 'range');
  assert.equal(fieldByLabel(view.container, 'Act').localName, 'select');
  assert.equal(fieldByLabel(view.container, 'Beat').localName, 'select');
  assert.equal(fieldByLabel(view.container, 'Notes').localName, 'textarea');
  await view.unmount();
});

test('Scenes and Chapter summary are headings, not labels, and the scene list is named', async () => {
  const view = await openChapter({ ai: true });
  const labels = view.queryAll('label').map((l) => l.textContent);
  assert.ok(!labels.some((t) => t.includes('Scenes') || t.includes('Chapter summary')), `labels: ${labels}`);
  const list = view.query('ul.map-scene-list');
  const heading = view.container.querySelector(`[id="${list.getAttribute('aria-labelledby')}"]`);
  assert.equal(heading.textContent, 'Scenes');
  await view.unmount();
});
