import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, createRef } from 'react';
import { click, press, render, type } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import { InlineField, InlineSelect, InlineTextarea } from '../src/components/codex/InlineFields.jsx';
import CodexView from '../src/pages/CodexView.jsx';

test('a shared textarea defaults to 4 rows and takes a rows prop', async () => {
  const view = await render(h(InlineTextarea, { label: 'Notes', value: 'Old', onSave() {} }));
  await click(view.container.querySelector('button.inline-field-value'));
  assert.equal(view.container.querySelector('textarea.inline-field-textarea').getAttribute('rows'), '4');
  await view.unmount();

  const taller = await render(h(InlineTextarea, { label: 'Notes', value: 'Old', rows: 5, onSave() {} }));
  await click(taller.container.querySelector('button.inline-field-value'));
  assert.equal(taller.container.querySelector('textarea.inline-field-textarea').getAttribute('rows'), '5');
  await taller.unmount();
});

const codex = {
  characters: [{ id: 'ch1', name: 'Mara', flags: [], notes: 'Keeps the lamp lit' }],
  worldRules: [{ id: 'r1', rule: 'Magic costs blood', category: 'magic', flags: [] }],
};

const fieldButton = (view, label) => view.queryAll('button.inline-field-value')
  .find((b) => b.getAttribute('aria-label').startsWith(`${label}:`));

test('the Codex sheets keep their textarea heights: 5 rows for a rule, 4 for a character', async () => {
  const view = await renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex },
  });
  await click(view.button('World Rules'));
  await click(view.button('Magic costs blood'));
  await click(fieldButton(view, 'Description'));
  assert.equal(view.query('textarea.inline-field-textarea').getAttribute('rows'), '5');
  await view.unmount();

  const second = await renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex },
  });
  await click(second.button('Mara'));
  await click(fieldButton(second, 'Notes'));
  assert.equal(second.query('textarea.inline-field-textarea').getAttribute('rows'), '4');
  await second.unmount();
});

test('a shared field uses a passed valueRef as its value button', async () => {
  const ref = createRef();
  const saved = [];
  const view = await render(h(InlineField, { label: 'Name', value: 'Mara', valueRef: ref, onSave: (v) => saved.push(v) }));
  const button = view.container.querySelector('button.inline-field-value');
  assert.equal(ref.current, button);
  await click(button);
  await type(view.container.querySelector('input.inline-field-input'), 'Ada');
  await press(view.container.querySelector('input.inline-field-input'), 'Enter');
  assert.equal(document.activeElement, ref.current);
  assert.deepEqual(saved, ['Ada']);
  await view.unmount();
});

test('a shared select capitalises its value and options', async () => {
  const view = await render(h(InlineSelect, { label: 'Category', value: 'magic', options: ['magic', 'politics'], onSave() {} }));
  const button = view.container.querySelector('button.inline-field-value');
  assert.equal(button.textContent, 'Magic');
  await click(button);
  const texts = [...view.container.querySelectorAll('select.inline-field-select option')].map((o) => o.textContent);
  assert.deepEqual(texts, ['Magic', 'Politics']);
  await view.unmount();
});
