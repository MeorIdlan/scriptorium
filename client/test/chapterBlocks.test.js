import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import ChapterBlocks from '../src/components/map/ChapterBlocks.jsx';

const chapter = (over) => ({ id: 'c1', number: 1, title: 'One', act: 'Act I', wordCount: 1000, scenes: [], beat: 'x', ...over });

test('a chapter outside the three acts borders with the control token, not a hex colour', async () => {
  const view = await renderApp(h(ChapterBlocks, { chapters: [chapter({ act: undefined })] }));
  assert.match(view.query('.chapter-block').getAttribute('style'), /border-color:\s*var\(--border-control\)/);
  await view.unmount();
});

test('a selected chapter outside the three acts keeps its tint', async () => {
  const view = await renderApp(h(ChapterBlocks, { chapters: [chapter({ act: undefined })] }));
  await click(view.query('.chapter-block'));
  assert.match(view.query('.chapter-block').getAttribute('style'), /background:\s*color-mix\(in srgb, var\(--border-control\) 20%, transparent\)/);
  await view.unmount();
});
