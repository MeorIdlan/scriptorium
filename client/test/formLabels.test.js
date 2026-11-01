import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every <label> in the app must name a field: either it points at the field
// with htmlFor, or it wraps the field. A label that does neither is announced
// by a screen reader as nothing, and clicking it does not focus the field.
// Headings for button groups and static text are spans, not labels.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Files still being fixed (card PdTKm196). Each fix task removes its files.
const UNFIXED = new Set([
  'components/overlays/ExportModal.jsx',
  'components/settings/ApiKeyField.jsx',
  'components/settings/ModelSelect.jsx',
  'components/settings/ParamSliders.jsx',
  'components/settings/ProviderSelect.jsx',
  'components/shelves/NewWorkWizard.jsx',
  'pages/Settings.jsx',
]);

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsxFiles(path);
    return entry.name.endsWith('.jsx') ? [path] : [];
  });
}

// Labels in `source` that have neither htmlFor nor a wrapped input, select or textarea
export function unlinkedLabels(source) {
  const found = [];
  for (const match of source.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
    const [, attrs, body] = match;
    if (/\bhtmlFor\s*=/.test(attrs)) continue;
    if (/<(input|select|textarea)\b/.test(body)) continue;
    found.push({ line: source.slice(0, match.index).split('\n').length, text: body.trim().split('\n')[0] });
  }
  return found;
}

const offenders = new Map();
for (const file of jsxFiles(srcDir)) {
  const hits = unlinkedLabels(readFileSync(file, 'utf8'));
  if (hits.length) offenders.set(relative(srcDir, file).split('\\').join('/'), hits);
}

test('every <label> has htmlFor or wraps its control', () => {
  const problems = [];
  for (const [file, hits] of offenders) {
    if (UNFIXED.has(file)) continue;
    for (const { line, text } of hits) problems.push(`${file}:${line}  ${text}`);
  }
  assert.deepEqual(problems, [], `labels with neither htmlFor nor a wrapped control:\n${problems.join('\n')}`);
});

test('UNFIXED lists only files that still have unlinked labels', () => {
  const stale = [...UNFIXED].filter((file) => !offenders.has(file));
  assert.deepEqual(stale, [], `remove these from UNFIXED, they are fixed: ${stale.join(', ')}`);
});

test('the scan tells linked labels from unlinked ones', () => {
  const ok = `<label htmlFor={id}>Name</label>\n<label>Name <input /></label>\n<label className="x">Pick <select></select></label>`;
  assert.deepEqual(unlinkedLabels(ok), []);
  const bad = `<div>\n<label className="form-label">Format</label>\n</div>`;
  assert.deepEqual(unlinkedLabels(bad), [{ line: 2, text: 'Format' }]);
});
