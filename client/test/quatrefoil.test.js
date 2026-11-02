// The quatrefoil divider (card uqVctsf5, handoff Ornaments): it separates groups outside the
// writing area. It is drawn with a CSS mask, so it never appears in the editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import QuillTab from '../src/components/panel/QuillTab.jsx';

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', wordCount: 0 },
  'GET /works/w1/chapters': [],
  'GET /works/w1/catches': [],
  'GET /works/w1/sessions/latest': {},
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
};

test('the Quill tab divides AI Assist from AI Editor with a quatrefoil', async () => {
  const view = await renderApp(h(QuillTab, { workId: 'w1' }), { ai: true, routes });
  const children = [...view.query('.quill-tab').children];
  const groups = children.map((c, i) => [c, i]).filter(([c]) => c.classList.contains('quill-actions'));
  assert.equal(groups.length, 2, 'AI Assist and AI Editor groups');
  const between = children.slice(groups[0][1] + 1, groups[1][1]);
  const divider = between.find((c) => c.classList.contains('quatrefoil'));
  assert.ok(divider, 'no quatrefoil between the groups');
  assert.equal(divider.getAttribute('aria-hidden'), 'true');
  await view.unmount();
});
