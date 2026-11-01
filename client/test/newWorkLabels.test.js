import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click, type } from './support/render.js';
import { fieldByLabel } from './support/labels.js';
import NewWorkWizard from '../src/components/shelves/NewWorkWizard.jsx';

test('the New Work wizard fields are reached through their labels on every step', async () => {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }));
  const title = fieldByLabel(view.container, 'Title');
  assert.equal(title.localName, 'input');
  assert.equal(fieldByLabel(view.container, 'Genre').localName, 'select');
  assert.equal(fieldByLabel(view.container, 'Point of View').localName, 'select');
  // Next stays disabled until the work has a title
  await type(title, 'The Long Road');
  await click(view.button('Next'));
  assert.equal(fieldByLabel(view.container, 'Tone').localName, 'input');
  assert.equal(fieldByLabel(view.container, 'Protagonist').localName, 'input');
  assert.equal(fieldByLabel(view.container, 'Premise').localName, 'input');
  await view.unmount();
});
