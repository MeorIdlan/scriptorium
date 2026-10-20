import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click, press } from './support/render.js';
import './support/focus.js';
import SceneRow from '../src/components/panel/SceneRow.jsx';

const scene = { id: 's1', title: 'The pier', pov: '', location: '', status: 'draft', summary: '', threadIds: [], wordCount: 0 };

function renderRow() {
  return render(h(SceneRow, { scene, characters: [], places: [], onJump() {}, onSave() {}, onRemove() {} }));
}

const button = (view, label) => [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('Cancel in the card form returns focus to Edit card', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit card'));
  await click(button(view, 'Cancel'));
  assert.equal(document.activeElement === button(view, 'Edit card'), true);
  await view.unmount();
});

test('Esc in the card form returns focus to Edit card', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit card'));
  await press(view.container.querySelector('.scene-card-form'), 'Escape');
  assert.equal(document.activeElement === button(view, 'Edit card'), true);
  await view.unmount();
});

test('Remove break opens its confirmation with focus on Cancel, and Cancel returns focus to Remove break', async () => {
  const view = await renderRow();
  await click(button(view, 'Remove break'));
  assert.equal(document.activeElement === button(view, 'Cancel'), true);
  await click(button(view, 'Cancel'));
  assert.equal(document.activeElement === button(view, 'Remove break'), true);
  await view.unmount();
});
