import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useEffect } from 'react';
import { renderApp } from './support/app.js';
import { flush, click } from './support/render.js';
import { fieldByLabel } from './support/labels.js';
import { useUI } from '../src/context/UIContext.jsx';
import ExportModal from '../src/components/overlays/ExportModal.jsx';

function Driver() {
  const { dispatch } = useUI();
  useEffect(() => {
    dispatch({ type: 'OPEN_EXPORT', workId: 'work_a' });
  }, [dispatch]);
  return h(ExportModal);
}

// The group a heading names: role=group whose aria-labelledby points at an element with that text
function groupNamed(view, name) {
  return view.queryAll('[role="group"]').find((g) => {
    const heading = view.container.querySelector(`[id="${g.getAttribute('aria-labelledby')}"]`);
    return heading && heading.textContent === name;
  });
}

const PREFILL = { authorName: 'Ada Writer', surname: 'Writer', contactBlock: '', headerTitle: 'THE BOOK', font: 'serif', workOnly: false };

async function openManuscript() {
  const view = await renderApp(h(Driver), { routes: { 'GET /works/work_a/export/manuscript': PREFILL } });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  return view;
}

test('the manuscript details are reached through their labels', async () => {
  const view = await openManuscript();
  assert.equal(fieldByLabel(view.container, 'Author name').localName, 'input');
  assert.equal(fieldByLabel(view.container, 'Surname').localName, 'input');
  assert.equal(fieldByLabel(view.container, 'Contact block').localName, 'textarea');
  assert.equal(fieldByLabel(view.container, 'Header title').localName, 'input');
  await view.unmount();
});

test('Format, Layout, Font and Options are named groups', async () => {
  const view = await openManuscript();
  for (const name of ['Format', 'Layout', 'Font', 'Options']) {
    assert.ok(groupNamed(view, name), `no group named ${name}`);
  }
  assert.ok(groupNamed(view, 'Format').querySelector('button'));
  assert.ok(groupNamed(view, 'Options').querySelector('input[type="checkbox"]'));
  await view.unmount();
});

test('every label in the export dialog has a field', async () => {
  const view = await openManuscript();
  const lonely = view.queryAll('label').filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'));
  assert.deepEqual(lonely.map((l) => l.textContent), []);
  await view.unmount();
});
