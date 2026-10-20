import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click, flush, press, type } from './support/render.js';
import './support/focus.js';
import ChapterHistoryModal from '../src/components/overlays/ChapterHistoryModal.jsx';

const base = '/works/w1/chapters/c1/snapshots';
// s1 is the newest version (an autosave, so Keep applies); s2 is a named one
let versions;
const routes = {
  [`GET ${base}`]: () => versions,
  [`GET ${base}/s1`]: { content: 'Newer text.' },
  [`GET ${base}/s2`]: { content: 'Older text.' },
  [`POST ${base}`]: { id: 's3' },
  [`PATCH ${base}/s2`]: {},
  [`POST ${base}/s1/restore`]: { id: 'c1', content: 'Newer text.', contentHtml: '<div>Newer text.</div>', threadIds: [] },
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One', threadIds: [] }],
};

function reset() {
  versions = [
    { id: 's1', kind: 'auto', name: null, note: '', milestoneId: null, wordCount: 2, createdAt: '2026-10-19T10:00:00.000Z' },
    { id: 's2', kind: 'named', name: 'Draft one', note: '', milestoneId: null, wordCount: 2, createdAt: '2026-10-18T10:00:00.000Z' },
  ];
}

const dialogButton = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

// Runs a scenario on a fresh modal; unmounts even when an assertion fails, so
// one failure can't leave a mounted root behind for the rest of the file
async function scenario(run) {
  reset();
  const view = await renderApp(h(ChapterHistoryModal, { workId: 'w1', chapterId: 'c1', onDismiss() {} }), { routes });
  try {
    await flush();
    await run();
  } finally {
    await view.unmount();
  }
}

test('Esc in the snapshot naming field returns focus to Save snapshot', async () => {
  await scenario(async () => {
    const save = dialogButton('Save snapshot…');
    await pressButton(save);
    await press(document.querySelector('.history-name-input'), 'Escape');
    assert.equal(document.activeElement === save, true);
  });
});

test('saving a rename returns focus to Rename', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[2]);
    await flush();
    const rename = dialogButton('Rename…');
    await pressButton(rename);
    // The field opens with the current name, so Enter saves without typing
    await press(document.querySelector('.history-name-input'), 'Enter');
    await flush();
    assert.equal(document.querySelector('.history-name-input'), null);
    assert.equal(document.activeElement === dialogButton('Rename…'), true);
  });
});

test('Cancel on a keep-version name returns focus to Keep this version', async () => {
  await scenario(async () => {
    const keep = dialogButton('Keep this version…');
    await pressButton(keep);
    await click(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Keep this version…'), true);
  });
});

test('Cancel on a rename returns focus to Rename', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[2]);
    await flush();
    const rename = dialogButton('Rename…');
    await pressButton(rename);
    await click(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Rename…'), true);
  });
});

test('Cancel on the restore confirmation returns focus to Restore this version', async () => {
  await scenario(async () => {
    const restore = dialogButton('Restore this version');
    await pressButton(restore);
    await click(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Restore this version'), true);
  });
});

test('Cancel on the delete confirmation returns focus to Delete', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[2]);
    await flush();
    const del = dialogButton('Delete…');
    await pressButton(del);
    await click(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Delete…'), true);
  });
});

test('a confirmed delete leaves focus on the selected version', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[2]);
    await flush();
    await pressButton(dialogButton('Delete…'));
    // The server drops the version; the list reloads without it
    routes[`DELETE ${base}/s2`] = () => {
      versions = versions.filter((v) => v.id !== 's2');
      return {};
    };
    await pressButton(dialogButton('Delete'));
    await flush();
    const active = document.querySelector('.history-item.active');
    assert.equal(document.activeElement === active, true);
  });
});
