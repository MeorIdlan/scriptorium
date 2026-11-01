// Changing the editor's default font is a style change only (card uqVctsf5): opening a
// chapter, with or without its own formatting, must not rewrite or re-save its HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { Routes, Route } from 'react-router-dom';
import { renderApp } from './support/app.js';
import MainRoom from '../src/pages/MainRoom.jsx';

const html = {
  plain: '<p>The lamp would not stay lit.</p>',
  formatted: '<p><font size="4" face="Arial">The lamp</font> <b>would</b> not stay lit.</p>',
};

function routesFor(contentHtml) {
  return {
    'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
    'GET /works/w1/chapters': [{ id: 'c1', number: 1, title: 'Title c1', wordCount: 5 }],
    'GET /works/w1/chapters/c1': { id: 'c1', content: 'The lamp would not stay lit.', contentHtml },
    'GET /works/w1/catches': [],
    'GET /works/w1/codex': {},
    'GET /works/w1/map': {},
    'GET /works/w1/threads': [],
    'GET /progress/today': { date: '2026-11-02', words: 0, goal: null },
  };
}

for (const [name, contentHtml] of Object.entries(html)) {
  test(`opening a ${name} chapter leaves its HTML alone and saves nothing`, async () => {
    const view = await renderApp(
      h(Fragment, null, h(Routes, null, h(Route, { path: '/work/:workId/chapter/:chapterId', element: h(MainRoom) }))),
      { routes: routesFor(contentHtml), path: '/work/w1/chapter/c1' }
    );
    assert.equal(view.query('.editor').innerHTML, contentHtml);
    await view.unmount();
    const saves = view.fetch.calls.filter((c) => c.method === 'PUT' && c.path.startsWith('/works/w1/chapters/c1'));
    assert.deepEqual(saves, []);
  });
}
