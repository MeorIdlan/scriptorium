// The three gothic faces are served by the app itself (card uqVctsf5, A3): Fontsource
// packages bundled by Vite, no font host at runtime, and every font-family a token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('src/main.jsx');
const css = read('src/index.css');
const html = read('index.html');

// Only the Latin files for the weights the design uses; the editor has bold and italic
const IMPORTS = [
  '@fontsource/pirata-one/latin-400.css',
  '@fontsource/eb-garamond/latin-400.css',
  '@fontsource/eb-garamond/latin-400-italic.css',
  '@fontsource/eb-garamond/latin-700.css',
  '@fontsource/eb-garamond/latin-700-italic.css',
  '@fontsource/spectral/latin-400.css',
  '@fontsource/spectral/latin-500.css',
];

test('the three Fontsource packages are client dependencies', () => {
  for (const name of ['@fontsource/pirata-one', '@fontsource/eb-garamond', '@fontsource/spectral']) {
    assert.ok(pkg.dependencies?.[name], `${name} is not in dependencies`);
  }
});

test('main.jsx imports each face and every import resolves to a real file', () => {
  for (const spec of IMPORTS) {
    assert.ok(main.includes(`import '${spec}';`), `main.jsx should import ${spec}`);
    assert.ok(existsSync(join(root, 'node_modules', spec)), `${spec} is not installed`);
  }
  // The faces load before the stylesheet that uses them
  assert.ok(main.indexOf('@fontsource/spectral') < main.indexOf("import './index.css'"), 'font imports come before index.css');
});

test('no third-party font host in index.html or index.css', () => {
  for (const [file, text] of [['index.html', html], ['index.css', css]]) {
    assert.doesNotMatch(text, /fonts\.(googleapis|gstatic)\.com/, `${file} names a Google font host`);
    assert.doesNotMatch(text, /@import\s+url\(\s*['"]?https?:/i, `${file} imports a remote stylesheet`);
    assert.doesNotMatch(text, /https?:\/\/[^'")\s]*\.(woff2?|ttf|otf)\b/i, `${file} loads a remote font file`);
  }
});

test('the body text uses the interface font', () => {
  const body = css.match(/\nbody\s*\{([^}]*)\}/);
  assert.ok(body, 'body rule is missing');
  assert.match(body[1], /font-family:\s*var\(--font-ui\)\s*;/);
});

// A font-family is a font token or inherit; nothing else
test('every font-family in index.css is a font token', () => {
  const offenders = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const clean = selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    for (const [, value] of body.matchAll(/font-family:\s*([^;}]+)/g)) {
      const v = value.trim();
      if (v === 'inherit' || /^var\(--font-(display|reading|ui)\)$/.test(v)) continue;
      offenders.push(`${clean}: ${v}`);
    }
  }
  assert.deepEqual(offenders, []);
});
