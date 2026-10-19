import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const css = readFileSync(join(srcDir, 'index.css'), 'utf8');

const rootBlock = css.match(/:root\s*\{([^}]*)\}/);
const tokens = {};
for (const [, name, value] of rootBlock[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  tokens[name] = value;
}

const TEXT_TOKENS = ['text', 'text-muted', 'text-dim', 'gold', 'gold-dim', 'error', 'success', 'teal', 'purple', 'coral', 'amber'];
const BACKGROUNDS = ['bg', 'bg-elevated', 'bg-card', 'bg-input', 'sidebar-bg'];
const CONTROL_TOKENS = ['border-control', 'border-focus'];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(name) {
  assert.ok(tokens[name], `--${name} is missing from :root`);
  return tokens[name];
}

test('text tokens meet AA on every background', () => {
  for (const text of TEXT_TOKENS) {
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(token(text), token(bg));
      assert.ok(ratio >= 4.5, `--${text} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  }
});

test('control borders and focus ring meet 3:1', () => {
  for (const control of CONTROL_TOKENS) {
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(token(control), token(bg));
      assert.ok(ratio >= 3, `--${control} on --${bg} is ${ratio.toFixed(2)}:1, needs 3:1`);
    }
  }
});

test('text hierarchy is preserved', () => {
  assert.ok(luminance(token('text-dim')) < luminance(token('text-muted')), '--text-dim must be dimmer than --text-muted');
  assert.ok(luminance(token('text-muted')) < luminance(token('text')), '--text-muted must be dimmer than --text');
});

function ruleBody(selector) {
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'g'))];
  assert.ok(blocks.length, `${selector} rule is missing from index.css`);
  return blocks.map((m) => m[1]).join('\n');
}

test('clickable map controls use the control border token (not the divider)', () => {
  for (const selector of ['.thread-status', '.chapter-block']) {
    const border = ruleBody(selector).match(/border:\s*\d+px solid ([^;]+);/);
    assert.ok(border, `${selector} has no solid border`);
    assert.equal(border[1].trim(), 'var(--border-control)', `${selector} border must use var(--border-control)`);
  }
});

test('no hard-coded text colours outside :root', () => {
  const outsideRoot = css.replace(rootBlock[0], '');
  const colorDecl = /(?:^|[\s;{])color\s*:\s*([^;}]+)/g;
  const hardCoded = /^(#[0-9a-fA-F]{3,8}\b|rgba?\()/i;
  const offenders = [...outsideRoot.matchAll(colorDecl)]
    .map((m) => m[1].trim())
    .filter((value) => hardCoded.test(value));
  assert.deepEqual(offenders, [], `hard-coded text colours in index.css: ${offenders.join(', ')}`);
});

test('no hard-coded text colours in jsx inline styles', () => {
  const jsxFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.jsx')) jsxFiles.push(path);
    }
  };
  walk(srcDir);
  const inlineColor = /color\s*:\s*['"`]\s*(#|rgba?\()/i;
  const offenders = jsxFiles.filter((file) => inlineColor.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => file.slice(srcDir.length + 1)), [], 'inline hex/rgb text colours in jsx');
});
