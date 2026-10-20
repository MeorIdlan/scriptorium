import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click } from './support/render.js';
import Settings from '../src/pages/Settings.jsx';

test('Settings shows the Backup section with AI off (S2)', async () => {
  const view = await renderApp(h(Settings), { ai: false });
  await flush();
  const text = view.text();
  assert.match(text, /Backup/);
  assert.match(text, /Back up everything \(\.zip\)/);
  await view.unmount();
});

test('the hidden form posts to /api/backup into the hidden frame (S4)', async () => {
  const view = await renderApp(h(Settings), { ai: false });
  await flush();
  const form = view.query('[data-testid="account-backup-form"]');
  const frame = view.query('iframe[name="account-backup-frame"]');
  assert.equal(form.getAttribute('method').toLowerCase(), 'post');
  assert.equal(form.getAttribute('action'), '/api/backup');
  assert.equal(form.getAttribute('target'), frame.getAttribute('name'));
  assert.equal(frame.hasAttribute('hidden'), true);
  await view.unmount();
});

test('clicking submits once and disables the button (review focus 5)', async () => {
  const view = await renderApp(h(Settings), { ai: false });
  await flush();
  const form = view.query('[data-testid="account-backup-form"]');
  const button = view.query('[data-testid="account-backup-button"]');
  let submits = 0;
  form.submit = () => {
    submits += 1;
  };
  await click(button);
  await click(button);
  assert.equal(submits, 1);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.equal(/download has started/.test(view.text()), true);
  await view.unmount();
});
