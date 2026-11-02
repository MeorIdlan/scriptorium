import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleIn } from './support/css.js';

const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const phone = (selector) => ruleIn(css, '(max-width: 640px)', selector) ?? '';
const topLevel = css.replace(/@media[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

test('Shelves has phone padding and its header wraps', () => {
  assert.match(phone('.shelves-page'), /padding:\s*20px 16px/);
  const header = phone('.shelves-header');
  assert.match(header, /flex-wrap:\s*wrap/);
  assert.match(header, /gap:\s*12px/);
});

test('the shelf is one column at 390px', () => {
  assert.match(phone('.work-grid'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('the work card menu button is touch size', () => {
  const button = phone('.work-card-menu-btn');
  assert.match(button, /min-width:\s*44px/);
  assert.match(button, /min-height:\s*44px/);
});

test('the auth card fills a phone, with 16px touch-size fields and buttons', () => {
  assert.match(phone('.auth-page'), /padding:\s*16px/);
  const card = phone('.auth-card');
  assert.match(card, /width:\s*100%/);
  assert.match(card, /max-width:\s*none/);
  const input = phone('.auth-card input');
  assert.match(input, /font-size:\s*16px/);
  assert.match(input, /min-height:\s*44px/);
  assert.match(phone('.auth-card button'), /min-height:\s*44px/);
});

test('the admin users table scrolls sideways inside itself on a phone', () => {
  const table = phone('.admin-users-table');
  assert.match(table, /display:\s*block/);
  assert.match(table, /overflow-x:\s*auto/);
});

test('none of the phone rules leak above 640px', () => {
  assert.match(topLevel, /\.work-grid \{[^}]*repeat\(auto-fill,\s*minmax\(280px,\s*1fr\)\)/);
  assert.match(topLevel, /\.auth-card \{[^}]*width:\s*360px/);
  assert.ok(!/\.admin-users-table \{[^}]*overflow-x/.test(topLevel));
});
