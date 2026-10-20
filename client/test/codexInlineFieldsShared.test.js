import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, createRef } from 'react';
import { click, press, render, type } from './support/render.js';
import './support/focus.js';
import { InlineField, InlineSelect, InlineTextarea } from '../src/components/codex/InlineFields.jsx';

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
