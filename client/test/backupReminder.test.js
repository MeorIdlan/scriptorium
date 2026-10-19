import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { renderApp, HttpError } from './support/app.js';
import { flush, click } from './support/render.js';
import Shelves from '../src/pages/Shelves.jsx';
import BackupReminder from '../src/components/backup/BackupReminder.jsx';
import MainRoom from '../src/pages/MainRoom.jsx';

const DUE_12 = { due: true, lastBackupAt: '2026-10-07T09:00:00.000Z', daysSinceBackup: 12 };

function work(backupReminder) {
  return { id: 'w1', title: 'The Long Night', wordCount: 0, status: 'active', backupReminder };
}

// Shows the current path, so a test can see whether a click opened the work
function LocationProbe() {
  return h('p', { 'data-testid': 'location' }, useLocation().pathname);
}

// Shelves with one work from GET /works
async function renderShelf(reminder, routes = {}) {
  return renderApp(h(Fragment, null, h(Shelves), h(LocationProbe)), {
    routes: { 'GET /works': [work(reminder)], ...routes },
  });
}

// Answers POST /works/w1/backup itself and passes everything else on to the
// stub renderApp installed. `reply` builds the Response.
function stubBackup(reply) {
  const next = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    if (method === 'POST' && path === '/works/w1/backup') {
      requests.push(`${method} ${path}`);
      return reply();
    }
    return next(url, options);
  };
  return requests;
}

// Captures the blobs saved and the anchors clicked for download
function captureDownloads() {
  const saved = [];
  const downloads = [];
  const originalCreate = URL.createObjectURL;
  const originalElement = document.createElement;
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return 'blob:x';
  };
  document.createElement = function (tag, ...rest) {
    const el = originalElement.call(this, tag, ...rest);
    if (tag === 'a') downloads.push(el);
    return el;
  };
  return {
    saved,
    downloads,
    restore() {
      URL.createObjectURL = originalCreate;
      document.createElement = originalElement;
    },
  };
}

function reminderStrip(view) {
  return view.query('[data-testid="backup-reminder"]');
}

test('the card shows "Not backed up in 12 days" for a due work', async () => {
  const view = await renderShelf(DUE_12);
  assert.match(reminderStrip(view).textContent, /Not backed up in 12 days/);
  await view.unmount();
});

test('a single missed day reads "1 day"', async () => {
  const view = await renderShelf({ due: true, lastBackupAt: '2026-10-18T09:00:00.000Z', daysSinceBackup: 1 });
  assert.equal(view.query('.backup-reminder-text').textContent, 'Not backed up in 1 day');
  await view.unmount();
});

test('a never-backed-up due work shows "Never backed up"', async () => {
  const view = await renderShelf({ due: true, lastBackupAt: null, daysSinceBackup: null });
  assert.match(reminderStrip(view).textContent, /Never backed up/);
  await view.unmount();
});

test('no strip when backupReminder.due is false or missing', async () => {
  const notDue = await renderShelf({ due: false, lastBackupAt: null, daysSinceBackup: null });
  assert.equal(reminderStrip(notDue), null);
  await notDue.unmount();

  const missing = await renderShelf(undefined);
  assert.equal(reminderStrip(missing), null);
  await missing.unmount();
});

test('Back up now downloads the work\'s backup and hides the strip without re-reading the work', async () => {
  const downloads = captureDownloads();
  try {
    const view = await renderShelf(DUE_12);
    const requests = stubBackup(
      () =>
        new Response('zip-bytes', {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="the-long-night-backup.zip"',
          },
        })
    );
    await click(view.button('Back up now'));
    await flush();
    assert.deepEqual(requests, ['POST /works/w1/backup']);
    assert.equal(downloads.saved.length, 1);
    assert.equal(downloads.downloads[0].download, 'the-long-night-backup.zip');
    assert.equal(
      view.fetch.calls.some((c) => c.method === 'GET' && c.path === '/works/w1'),
      false
    );
    assert.equal(reminderStrip(view), null);
    await view.unmount();
  } finally {
    downloads.restore();
  }
});

test('a failed backup keeps the strip and shows the error', async () => {
  const downloads = captureDownloads();
  try {
    const view = await renderShelf(DUE_12);
    stubBackup(() => new Response(JSON.stringify({ error: 'Backup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    await click(view.button('Back up now'));
    await flush();
    assert.ok(reminderStrip(view));
    assert.match(view.query('.form-error').textContent, /Backup failed/);
    assert.equal(downloads.saved.length, 0);
    await view.unmount();
  } finally {
    downloads.restore();
  }
});

test('Later posts action snooze and hides the strip', async () => {
  const view = await renderShelf(DUE_12, {
    'POST /works/w1/backup-reminder': () => ({
      backupReminder: { due: false, lastBackupAt: DUE_12.lastBackupAt, daysSinceBackup: 12 },
    }),
  });
  await click(view.button('Later'));
  await flush();
  const post = view.fetch.calls.find((c) => c.path === '/works/w1/backup-reminder');
  assert.equal(post.method, 'POST');
  assert.deepEqual(post.body, { action: 'snooze' });
  assert.equal(reminderStrip(view), null);
  await view.unmount();
});

test('the ✕ posts action dismiss and hides the strip', async () => {
  const view = await renderShelf(DUE_12, {
    'POST /works/w1/backup-reminder': () => ({
      backupReminder: { due: false, lastBackupAt: DUE_12.lastBackupAt, daysSinceBackup: 12 },
    }),
  });
  await click(view.query('button[aria-label="Dismiss"]'));
  await flush();
  const post = view.fetch.calls.find((c) => c.path === '/works/w1/backup-reminder');
  assert.deepEqual(post.body, { action: 'dismiss' });
  assert.equal(reminderStrip(view), null);
  await view.unmount();
});

test('a failed snooze keeps the strip and shows the error', async () => {
  const view = await renderShelf(DUE_12, {
    'POST /works/w1/backup-reminder': () => new HttpError(500, 'SERVER', 'Could not snooze'),
  });
  await click(view.button('Later'));
  await flush();
  assert.ok(reminderStrip(view));
  assert.match(view.query('.form-error').textContent, /Could not snooze/);
  await view.unmount();
});

test('clicking inside the strip doesn\'t open the work', async () => {
  const view = await renderShelf(DUE_12, {
    'POST /works/w1/backup-reminder': () => ({
      backupReminder: { due: false, lastBackupAt: DUE_12.lastBackupAt, daysSinceBackup: 12 },
    }),
  });
  await click(reminderStrip(view));
  await flush();
  assert.equal(view.query('[data-testid="location"]').textContent, '/');
  await view.unmount();
});

test('the banner variant shows the banner copy and buttons', async () => {
  const onChange = () => {};
  const view = await renderApp(
    h(BackupReminder, {
      work: work(DUE_12),
      variant: 'banner',
      onChange,
    }),
  );
  const text = view.text();
  assert.match(text, /The Long Night hasn't been backed up in 12 days/);
  assert.ok(view.button('Back up now'));
  assert.ok(view.button('Remind me later'));
  assert.ok(view.button('Dismiss'));
  await view.unmount();
});

// The Main Room's editor writes innerText, which linkedom only has as a getter
Object.defineProperty(Object.getPrototypeOf(document.createElement('div')), 'innerText', {
  configurable: true,
  get() {
    return this.textContent;
  },
  set(text) {
    this.textContent = text;
  },
});

// Main Room with one work from GET /works/w1
const DUE_9 = { due: true, lastBackupAt: '2026-10-10T09:00:00.000Z', daysSinceBackup: 9 };

async function renderMainRoom(reminder, routes = {}) {
  return renderApp(h(MainRoom), {
    path: '/work/w1',
    route: '/work/:workId',
    routes: {
      'GET /works/w1': { id: 'w1', title: 'The Long Night', wordCount: 0, status: 'active', backupReminder: reminder },
      'GET /works/w1/chapters': [],
      'GET /works/w1/catches': [],
      'GET /progress/today': { words: 0, goal: null },
      ...routes,
    },
  });
}

test('the Main Room shows "<Title> hasn\'t been backed up in 9 days" for a due work', async () => {
  const view = await renderMainRoom(DUE_9);
  assert.match(view.query('.backup-reminder--banner').textContent, /The Long Night hasn't been backed up in 9 days/);
  await view.unmount();
});

test('the Main Room shows no banner when the work isn\'t due', async () => {
  const view = await renderMainRoom({ due: false, lastBackupAt: null, daysSinceBackup: null });
  assert.equal(view.query('[data-testid="backup-reminder"]'), null);
  await view.unmount();
});

test('Remind me later hides the banner', async () => {
  const view = await renderMainRoom(DUE_9, {
    'POST /works/w1/backup-reminder': () => ({
      backupReminder: { due: false, lastBackupAt: DUE_9.lastBackupAt, daysSinceBackup: 9 },
    }),
  });
  await click(view.button('Remind me later'));
  await flush();
  const post = view.fetch.calls.find((c) => c.path === '/works/w1/backup-reminder');
  assert.deepEqual(post.body, { action: 'snooze' });
  assert.equal(view.query('[data-testid="backup-reminder"]'), null);
  await view.unmount();
});
