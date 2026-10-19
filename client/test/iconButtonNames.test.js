import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, createRef } from 'react';
import { renderApp, aiSettings } from './support/app.js';
import { click, flush } from './support/render.js';
import './support/focus.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';
import HookGenerator from '../src/components/overlays/HookGenerator.jsx';
import CodexSuggestPanel from '../src/components/codex/CodexSuggestPanel.jsx';
import QuillTab from '../src/components/panel/QuillTab.jsx';
import PolishReviewModal from '../src/components/overlays/PolishReviewModal.jsx';

// Icon-only buttons are named by what they do, not by the symbol drawn on them
test('the toolbar alignment and scene-break buttons are named', async () => {
  const view = await renderApp(h(Toolbar, { editorRef: createRef() }));
  assert.ok(view.query('button[aria-label="Align left"]'));
  assert.ok(view.query('button[aria-label="Align center"]'));
  assert.ok(view.query('button[aria-label="Align right"]'));
  assert.ok(view.query('button[aria-label="Add a scene break"]'));
  await view.unmount();
});

// The ✕ buttons are named for what they close, not the symbol on them
test('the hook generator close button is named', async () => {
  const view = await renderApp(h(HookGenerator, { workId: 'w1' }));
  assert.ok(view.query('button[aria-label="Close hook generator"]'));
  await view.unmount();
});

test('the suggestions dismiss button is named', async () => {
  const view = await renderApp(h(CodexSuggestPanel, { workId: 'w1', entityType: 'character', entity: { name: 'Mara' } }), {
    ai: true,
    routes: { 'POST /ai/codex-suggest': { suggestions: [{ field: 'Age', text: 'Forty' }], context: null } },
  });
  await click(view.button('AI Suggestions'));
  await flush();
  assert.ok(view.query('button[aria-label="Dismiss suggestions"]'));
  await view.unmount();
});

test('the where-you-left-off dismiss button is named', async () => {
  const view = await renderApp(h(QuillTab, { workId: 'w2' }), {
    ai: true,
    routes: {
      'GET /works/w2': { id: 'w2', wordCount: 500 },
      'GET /works/w2/sessions/latest': null,
      'GET /settings': { ...aiSettings(true), autoFeatures: { rekindler: 'auto' } },
      'POST /ai/rekindler': { lastScene: 'The keeper climbed the stairs.', toneNote: '', characterMood: '' },
    },
  });
  await flush();
  assert.ok(view.query('button[aria-label="Dismiss where you left off"]'));
  await view.unmount();
});

test('the reject button on a polish change is named', async () => {
  const session = {
    chapterText: 'Mara ran.',
    batches: [[{ id: 'p1', text: 'Mara ran.', blockIndex: 0, start: 0 }]],
  };
  const view = await renderApp(h(PolishReviewModal, { workId: 'w1', chapterId: 'c1', session, summariesPending: false, onClose() {} }), {
    ai: true,
    routes: { 'POST /ai/polish-draft': { rewrites: [{ id: 'p1', text: 'Mara sprinted.' }], missing: [], context: null } },
  });
  await flush();
  // The review is portalled to the body, outside the container
  assert.ok(document.querySelector('button[aria-label="Keep the original"]'));
  await view.unmount();
});
