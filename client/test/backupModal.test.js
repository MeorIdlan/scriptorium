import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useEffect } from 'react';
import { renderApp } from './support/app.js';
import { flush, click } from './support/render.js';
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

// Answers POST /works/work_a/backup itself and passes everything else on to
// the stub renderApp installed. `reply` builds the Response.
function stubBackup(reply) {
  const next = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    if (method === 'POST' && path === '/works/work_a/backup') {
      requests.push(`${method} ${path}`);
      return reply();
    }
    return next(url, options);
  };
  return requests;
}

test('the modal offers a full backup alongside the manuscript export (A3)', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  const text = view.text();
  assert.match(text, /Full backup \(\.zip\)/);
  assert.match(text, /complete copy of this work/);
  assert.match(text, /not a manuscript/);
  await view.unmount();
});

test('the backup button posts to the backup route and saves the file', async () => {
  const saved = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return 'blob:x';
  };
  const downloads = [];
  const createElement = document.createElement;
  document.createElement = function (tag, ...rest) {
    const el = createElement.call(this, tag, ...rest);
    if (tag === 'a') downloads.push(el);
    return el;
  };
  try {
    const view = await renderApp(h(Driver));
    const requests = stubBackup(
      () =>
        new Response('zip-bytes', {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="work-a-backup-2026-10-14.zip"',
          },
        })
    );
    await flush();
    await click(view.query('[data-testid="backup-button"]'));
    await flush();
    assert.deepEqual(requests, ['POST /works/work_a/backup']);
    assert.equal(saved.length, 1);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'work-a-backup-2026-10-14.zip');
    assert.equal(view.query('.form-error'), null);
    await view.unmount();
  } finally {
    URL.createObjectURL = original;
    document.createElement = createElement;
  }
});

test('a truncated download shows an error and saves nothing (review focus 4)', async () => {
  const saved = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return 'blob:x';
  };
  try {
    const view = await renderApp(h(Driver));
    // The connection drops after the headers: reading the body fails
    stubBackup(() => {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new Error('Backup download was interrupted'));
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/zip' } });
    });
    await flush();
    await click(view.query('[data-testid="backup-button"]'));
    await flush();
    const error = view.query('.form-error');
    assert.ok(error);
    assert.match(error.textContent, /backup/i);
    assert.equal(saved.length, 0);
    await view.unmount();
  } finally {
    URL.createObjectURL = original;
  }
});
