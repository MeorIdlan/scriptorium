import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment, useEffect } from 'react';
import { renderApp, HttpError } from './support/app.js';
import { flush, click, press, type } from './support/render.js';
import { useUI } from '../src/context/UIContext.jsx';
import ExportModal from '../src/components/overlays/ExportModal.jsx';

// Opens the export modal for work_a through the UI context, as WorkCard does
function Driver() {
  const { dispatch } = useUI();
  useEffect(() => {
    dispatch({ type: 'OPEN_EXPORT', workId: 'work_a' });
  }, [dispatch]);
  return h(ExportModal);
}

const PREFILL = {
  authorName: 'Ada Writer',
  surname: 'Writer',
  contactBlock: '12 Lane\nLondon',
  headerTitle: 'THE BOOK',
  font: 'serif',
  workOnly: true,
};

// Saved files go to a stub instead of a real download
function stubDownloads() {
  const original = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:x';
  return () => {
    URL.createObjectURL = original;
  };
}

function exportCalls(view) {
  return view.fetch.calls.filter((c) => c.method === 'POST' && c.path === '/works/work_a/export');
}

function manuscriptFetches(view) {
  return view.fetch.calls.filter((c) => c.method === 'GET' && c.path === '/works/work_a/export/manuscript');
}

test('the layout selector shows for PDF and DOCX and hides for EPUB', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  assert.ok(view.query('[data-testid="layout-reading"]'));
  assert.ok(view.query('[data-testid="layout-manuscript"]'));
  await click(view.button('DOCX'));
  assert.ok(view.query('[data-testid="layout-manuscript"]'));
  await click(view.button('EPUB'));
  assert.equal(view.query('[data-testid="layout-manuscript"]'), null);
  assert.equal(view.query('[data-testid="layout-reading"]'), null);
  await view.unmount();
});

test('picking Manuscript fetches the saved details once and fills the fields', async () => {
  const view = await renderApp(h(Driver), {
    routes: { 'GET /works/work_a/export/manuscript': PREFILL },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  await click(view.query('[data-testid="layout-reading"]'));
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(manuscriptFetches(view).length, 1);
  assert.equal(view.query('[data-testid="ms-author"]').value, 'Ada Writer');
  assert.equal(view.query('[data-testid="ms-surname"]').value, 'Writer');
  assert.equal(view.query('[data-testid="ms-contact"]').value, '12 Lane\nLondon');
  assert.equal(view.query('[data-testid="ms-header-title"]').value, 'THE BOOK');
  assert.equal(view.query('[data-testid="ms-work-only"]').checked, true);
  assert.ok(view.query('[data-testid="ms-font-serif"]').classList.contains('active'));
  assert.doesNotMatch(view.text(), /Include chapter notes/);
  assert.match(view.text(), /Include outline chapters/);
  await view.unmount();
});

test('editing the details and exporting posts the manuscript layout', async () => {
  const restore = stubDownloads();
  try {
    const view = await renderApp(h(Driver), {
      routes: { 'GET /works/work_a/export/manuscript': PREFILL },
    });
    await flush();
    await click(view.query('[data-testid="layout-manuscript"]'));
    await type(view.query('[data-testid="ms-author"]'), 'Grace Hopper');
    await click(view.query('[data-testid="ms-font-mono"]'));
    await click(view.button('Export PDF'));
    const calls = exportCalls(view);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      format: 'pdf',
      includeNotes: false,
      includeOutline: false,
      layout: 'manuscript',
      manuscript: { ...PREFILL, authorName: 'Grace Hopper', font: 'mono' },
    });
    await view.unmount();
  } finally {
    restore();
  }
});

test('a reading export posts the reading layout and no manuscript details', async () => {
  const restore = stubDownloads();
  try {
    const view = await renderApp(h(Driver));
    await flush();
    await click(view.button('Export PDF'));
    const calls = exportCalls(view);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { format: 'pdf', includeNotes: false, includeOutline: false, layout: 'reading' });
    assert.equal(manuscriptFetches(view).length, 0);
    await view.unmount();
  } finally {
    restore();
  }
});

test('EPUB exports in the reading layout even after Manuscript was picked', async () => {
  const restore = stubDownloads();
  try {
    const view = await renderApp(h(Driver), {
      routes: { 'GET /works/work_a/export/manuscript': PREFILL },
    });
    await flush();
    await click(view.query('[data-testid="layout-manuscript"]'));
    await click(view.button('EPUB'));
    await click(view.button('Export EPUB'));
    const calls = exportCalls(view);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.layout, 'reading');
    assert.equal('manuscript' in calls[0].body, false);
    await view.unmount();
  } finally {
    restore();
  }
});

test('clearing the author name disables Export', async () => {
  const view = await renderApp(h(Driver), {
    routes: { 'GET /works/work_a/export/manuscript': PREFILL },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), false);
  await type(view.query('[data-testid="ms-author"]'), '');
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), true);
  await view.unmount();
});

test('Export stays disabled while the saved details are loading', async () => {
  let reply;
  const pending = new Promise((resolve) => {
    reply = resolve;
  });
  const view = await renderApp(h(Driver), {
    routes: { 'GET /works/work_a/export/manuscript': () => pending },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), true);
  reply(PREFILL);
  await flush();
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), false);
  await view.unmount();
});

// Opens the modal again after it was closed, as WorkCard does
function Reopen() {
  const { dispatch } = useUI();
  return h('button', { 'data-testid': 'reopen', onClick: () => dispatch({ type: 'OPEN_EXPORT', workId: 'work_a' }) }, 'Reopen');
}

test('a saved-details reply that lands after Cancel is not kept for the next open', async () => {
  let replies = 0;
  let late;
  const view = await renderApp(h(Fragment, null, h(Driver), h(Reopen)), {
    routes: {
      'GET /works/work_a/export/manuscript': () => {
        replies += 1;
        if (replies === 1) return new Promise((resolve) => { late = resolve; });
        return { ...PREFILL, authorName: 'Second Pick' };
      },
    },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  await click(view.button('Cancel'));
  late(PREFILL);
  await flush();
  await click(view.query('[data-testid="reopen"]'));
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(manuscriptFetches(view).length, 2);
  assert.equal(view.query('[data-testid="ms-author"]').value, 'Second Pick');
  await view.unmount();
});

test('a failed saved-details fetch shows the error and keeps Export disabled', async () => {
  const view = await renderApp(h(Driver), {
    routes: { 'GET /works/work_a/export/manuscript': () => new HttpError(500, 'SERVER_ERROR', 'Could not load details') },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.match(view.query('.form-error').textContent, /Could not load details/);
  await type(view.query('[data-testid="ms-author"]'), 'Grace Hopper');
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), true);
  await view.unmount();
});

test('switching back to Reading clears a failed saved-details error', async () => {
  const view = await renderApp(h(Driver), {
    routes: { 'GET /works/work_a/export/manuscript': () => new HttpError(500, 'SERVER_ERROR', 'Could not load details') },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(Boolean(view.query('.form-error')), true);
  await click(view.query('[data-testid="layout-reading"]'));
  assert.equal(Boolean(view.query('.form-error')), false);
  await view.unmount();
});

test('closing and reopening the modal starts on Reading with no manuscript fields', async () => {
  const view = await renderApp(h(Fragment, null, h(Driver), h(Reopen)), {
    routes: { 'GET /works/work_a/export/manuscript': PREFILL },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(Boolean(view.query('[data-testid="ms-author"]')), true);
  await click(view.button('Cancel'));
  await click(view.query('[data-testid="reopen"]'));
  assert.equal(view.query('[data-testid="layout-reading"]').classList.contains('active'), true);
  assert.equal(view.query('[data-testid="layout-manuscript"]').classList.contains('active'), false);
  assert.equal(Boolean(view.query('[data-testid="ms-author"]')), false);
  assert.equal(Boolean(view.query('[data-testid="ms-contact"]')), false);
  await view.unmount();
});

test('picking Manuscript again retries a failed fetch and enables Export once it loads', async () => {
  let replies = 0;
  const view = await renderApp(h(Driver), {
    routes: {
      'GET /works/work_a/export/manuscript': () => {
        replies += 1;
        return replies === 1 ? new HttpError(500, 'SERVER_ERROR', 'Could not load details') : PREFILL;
      },
    },
  });
  await flush();
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), true);
  await click(view.query('[data-testid="layout-manuscript"]'));
  assert.equal(manuscriptFetches(view).length, 2);
  assert.equal(view.query('[data-testid="ms-author"]').value, 'Ada Writer');
  assert.equal(Boolean(view.query('.form-error')), false);
  assert.equal(view.button('Export PDF').hasAttribute('disabled'), false);
  await view.unmount();
});

test('the export dialog is a labelled dialog, and Esc on a field inside it closes it', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  const dialog = view.query('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  await press(dialog.querySelector('button'), 'Escape');
  assert.equal(view.query('[role="dialog"]'), null);
  await view.unmount();
});
