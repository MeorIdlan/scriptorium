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
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  assert.ok(blocks.length, `${selector} rule is missing from index.css`);
  return blocks.map((m) => m[1]).join('\n');
}

// Paints an rgba() tint or a hex colour at its alpha over a solid background, as the browser does
function paint(colour, bgHex) {
  const rgba = colour.match(/rgba?\(([^)]*)\)/);
  const [r, g, b, a = 1] = rgba ? rgba[1].split(',').map(Number) : [...hexChannels(colour), 1];
  const bg = hexChannels(bgHex);
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexChannels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

test('rule category badges meet AA on their tint, on every background', () => {
  const badges = [...css.matchAll(/\n\.(rule-cat-[\w-]+)\s*\{([^}]*)\}/g)];
  assert.equal(badges.length, 5, 'expected one badge rule per category');
  for (const [, name, body] of badges) {
    const tint = body.match(/background:\s*(rgba\([^)]*\))/);
    const text = body.match(/color:\s*var\(--([\w-]+)\)/);
    assert.ok(tint && text, `.${name} needs a tint background and a colour token`);
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(paint(token(text[1]), token(bg)), paint(tint[1], token(bg)));
      assert.ok(ratio >= 4.5, `.${name} text on its tint over --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  }
});

// Text that is dimmed with a token and no opacity; the browser paints the element's opacity over its background
const DIMMED_TEXT = ['.thread-chip.resolved:not(.on)', '.chapter-block.dimmed .chapter-block-num'];

test('dimmed text meets AA on every background, with no opacity', () => {
  for (const selector of DIMMED_TEXT) {
    const body = ruleBody(selector);
    const text = body.match(/color:\s*var\(--([\w-]+)\)/);
    assert.ok(text, `${selector} needs a colour token`);
    const alpha = Number((body.match(/opacity:\s*([\d.]+)/) || [])[1] ?? 1);
    assert.equal(alpha, 1, `${selector} dims with opacity ${alpha}; use a text token instead`);
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(paint(token(text[1]), token(bg)), token(bg));
      assert.ok(ratio >= 4.5, `${selector} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  }
});

test('a dimmed chapter block recedes without opacity', () => {
  assert.doesNotMatch(ruleBody('.chapter-block.dimmed'), /opacity\s*:/);
});

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

test('no hard-coded border colours in jsx inline styles', () => {
  const jsxFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.jsx')) jsxFiles.push(path);
    }
  };
  walk(srcDir);
  const inlineBorder = /border(?:Color)?\s*:\s*['"`][^'"`]*#[0-9a-fA-F]{3,8}\b/i;
  const offenders = jsxFiles.filter((file) => inlineBorder.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => file.slice(srcDir.length + 1)), [], 'inline hex border colours in jsx');
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
