import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click, flush, press } from './support/render.js';
import './support/focus.js';
import MilestonesModal from '../src/components/overlays/MilestonesModal.jsx';

const base = '/works/w1/milestones';
// m1 has one changed chapter (so Compare and Restore chapter apply); m2 is empty
let milestones;
let detail;
const routes = {
  [`GET ${base}`]: () => milestones,
  [`GET ${base}/m1`]: () => detail,
  [`GET ${base}/m2`]: { id: 'm2', chapters: [] },
  [`POST ${base}`]: { id: 'm3', name: 'New one' },
  [`PATCH ${base}/m1`]: {},
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One' }],
  'GET /works/w1/chapters/c1': { id: 'c1', content: 'Now text.' },
  'GET /works/w1/chapters/c1/snapshots/s1': { content: 'Milestone text.' },
  [`POST ${base}/m1/chapters/c1/restore`]: () => ({ chapter: { id: 'c2', content: 'Milestone text.', contentHtml: '' } }),
  [`DELETE ${base}/m1`]: () => {
    milestones = milestones.filter((m) => m.id !== 'm1');
    return {};
  },
};

function reset() {
  milestones = [
    { id: 'm1', name: 'First draft', createdAt: '2026-10-18T10:00:00.000Z', chapterCount: 1, wordCount: 10 },
    { id: 'm2', name: 'Empty', createdAt: '2026-10-17T10:00:00.000Z', chapterCount: 0, wordCount: 0 },
  ];
  detail = {
    id: 'm1',
    chapters: [{ chapterId: 'c1', title: 'One', snapshotId: 's1', state: 'changed', wordsThen: 10, wordsNow: 12, added: 2, removed: 0 }],
  };
}

const dialogButton = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const rowButton = (label) => [...document.querySelectorAll('.milestone-row-actions button')].find((b) => b.textContent.trim() === label);

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

// Runs a scenario on a fresh modal; unmounts even when an assertion fails
async function scenario(run) {
  reset();
  const view = await renderApp(h(MilestonesModal, { workId: 'w1', onDismiss() {} }), { routes });
  try {
    await flush();
    await run();
  } finally {
    await view.unmount();
  }
}

test('Esc in the new milestone name returns focus to New milestone', async () => {
  await scenario(async () => {
    const add = dialogButton('New milestone…');
    await pressButton(add);
    await press(document.querySelector('.history-name-input'), 'Escape');
    assert.equal(document.activeElement === add, true);
  });
});

test('Cancel on a rename returns focus to Rename', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[0]);
    await flush();
    const rename = dialogButton('Rename…');
    await pressButton(rename);
    await pressButton(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Rename…'), true);
  });
});

test('the restore confirmation opens on Cancel', async () => {
  await scenario(async () => {
    await pressButton(rowButton('Restore chapter'));
    assert.equal(document.activeElement === dialogButton('Cancel'), true);
  });
});

test('Cancel on the restore confirmation returns focus to Restore chapter', async () => {
  await scenario(async () => {
    await pressButton(rowButton('Restore chapter'));
    await pressButton(dialogButton('Cancel'));
    assert.equal(document.activeElement === rowButton('Restore chapter'), true);
  });
});

test('Back from a comparison returns focus to Compare on that chapter', async () => {
  await scenario(async () => {
    await pressButton(rowButton('Compare'));
    await flush();
    await pressButton(dialogButton('← All chapters'));
    await flush();
    assert.equal(document.activeElement === rowButton('Compare'), true);
  });
});

test('a confirmed restore leaves focus on the selected milestone', async () => {
  await scenario(async () => {
    await pressButton(rowButton('Restore chapter'));
    detail = { id: 'm1', chapters: [{ ...detail.chapters[0], state: 'unchanged' }] };
    await pressButton(dialogButton('Restore'));
    await flush();
    await flush();
    assert.equal(document.activeElement === document.querySelector('.history-item.active'), true);
  });
});

test('Cancel on the delete confirmation returns focus to Delete…', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[0]);
    await flush();
    const del = dialogButton('Delete…');
    await pressButton(del);
    await pressButton(dialogButton('Cancel'));
    assert.equal(document.activeElement === dialogButton('Delete…'), true);
  });
});

test('a confirmed delete leaves focus on the selected milestone', async () => {
  await scenario(async () => {
    await click(document.querySelectorAll('.history-item')[0]);
    await flush();
    await pressButton(dialogButton('Delete…'));
    await pressButton(dialogButton('Delete'));
    await flush();
    assert.match(document.querySelector('.history-item.active').textContent, /Empty/);
    assert.equal(document.activeElement === document.querySelector('.history-item.active'), true);
  });
});
