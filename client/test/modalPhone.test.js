import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleIn } from './support/css.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

const PHONE = '(max-width: 640px)';
const phone = (selector) => ruleIn(css, PHONE, selector) ?? '';

test('on a phone a modal fills the screen', () => {
  assert.match(phone('.modal-backdrop'), /padding:\s*0\b/);
  const modal = phone('.modal-backdrop .modal');
  assert.match(modal, /width:\s*100%/);
  assert.match(modal, /max-width:\s*none/);
  assert.match(modal, /height:\s*100dvh/);
  assert.match(modal, /max-height:\s*none/);
  assert.match(modal, /border-radius:\s*0\b/);
});

test('a phone modal keeps its header and lets the body scroll', () => {
  assert.match(phone('.modal-backdrop .modal-header'), /flex-shrink:\s*0/);
  assert.match(phone('.modal-backdrop .modal-footer'), /flex-shrink:\s*0/);
  assert.match(phone('.modal-backdrop .modal-body'), /min-height:\s*0/);
});

test('the footer buttons stack on a phone and are touch size', () => {
  const footer = phone('.modal-backdrop .modal-footer');
  assert.match(footer, /flex-direction:\s*column/);
  assert.match(footer, /align-items:\s*stretch/);
  assert.match(phone('.modal-backdrop .modal-footer-right'), /flex-direction:\s*column/);
  assert.match(phone('.modal-backdrop .modal-footer .btn'), /min-height:\s*44px/);
});

test('the close button is touch size on a phone', () => {
  const close = phone('.modal-close');
  assert.match(close, /min-width:\s*44px/);
  assert.match(close, /min-height:\s*44px/);
});

test('fields in a modal are 16px on a phone, so iOS does not zoom the page', () => {
  for (const selector of ['.modal input', '.modal select', '.modal textarea']) {
    assert.match(phone(selector), /font-size:\s*16px/, selector);
  }
});

test('modals are unchanged above 640px', () => {
  // The phone rules live only in the media block, never at top level
  const topLevel = css.replace(/@media[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  assert.ok(!/\.modal-backdrop \.modal\b/.test(topLevel), 'phone modal rules leaked out of the media query');
  const base = css.match(/\n\.modal \{([^}]*)\}/)[1];
  assert.match(base, /max-width:\s*540px/);
  assert.match(base, /max-height:\s*90vh/);
});

test('the phone modal rules sit before the Drawers block, which stays last', () => {
  const at = raw.indexOf('.modal-backdrop .modal {');
  const drawers = raw.indexOf('   Drawers\n');
  assert.ok(at > 0, 'phone modal rule is missing');
  assert.ok(at < drawers, 'phone modal rules must come before the Drawers block');
});
