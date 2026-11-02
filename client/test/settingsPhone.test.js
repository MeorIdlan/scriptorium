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

test('Settings has phone padding', () => {
  assert.match(phone('.settings-page'), /padding:\s*20px 16px 40px/);
  assert.match(phone('.settings-section'), /padding:\s*16px/);
});

test('rows of controls wrap instead of overflowing', () => {
  assert.match(phone('.settings-actions'), /flex-wrap:\s*wrap/);
  assert.match(phone('.api-key-field'), /flex-wrap:\s*wrap/);
  assert.match(phone('.api-key-field .form-input'), /flex:\s*1 1 100%/);
  assert.match(phone('.api-key-confirm'), /flex-wrap:\s*wrap/);
  assert.match(phone('.settings-radio-option'), /flex-wrap:\s*wrap/);
});

test('fields and buttons are touch size and 16px on a phone', () => {
  for (const selector of ['.settings-page .form-input', '.settings-page .form-select', '.settings-page .form-textarea']) {
    assert.match(phone(selector), /font-size:\s*16px/, selector);
  }
  assert.match(phone('.settings-page .form-input'), /min-height:\s*44px/);
  assert.match(phone('.settings-page .btn'), /min-height:\s*44px/);
  assert.match(phone('.settings-radio-option'), /min-height:\s*44px/);
  assert.match(phone('.param-slider'), /min-height:\s*44px/);
});

test('the palette cards stack in one column on a phone', () => {
  assert.match(phone('.pick'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('the toast spans the screen width on a phone', () => {
  const toast = phone('.settings-toast');
  assert.match(toast, /left:\s*16px/);
  assert.match(toast, /right:\s*16px/);
});

test('Settings is unchanged above 640px', () => {
  assert.match(topLevel, /\.settings-page \{[^}]*padding:\s*28px 32px 48px/);
  assert.match(topLevel, /\.pick \{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(topLevel, /\.settings-toast \{[^}]*right:\s*1\.5rem/);
});
