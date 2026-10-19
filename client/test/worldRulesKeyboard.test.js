import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import WorldRules from '../src/components/codex/WorldRules.jsx';

const rules = [{ id: 'r1', category: 'magic', rule: 'Magic costs blood', establishedIn: 'Ch 2' }];

test('each rule item is a button that opens it for editing', async () => {
  const view = await renderApp(h(WorldRules, { workId: 'w1', rules, onRulesChange() {} }));
  const item = view.button('Magic costs blood');
  assert.equal(item.tagName.toLowerCase(), 'button');
  assert.equal(item.getAttribute('type'), 'button');
  await click(item);
  assert.ok(view.query('.rule-item.editing'));
  assert.equal(view.query('.rule-text-area').value, 'Magic costs blood');
  await view.unmount();
});
