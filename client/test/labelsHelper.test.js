import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { fieldByLabel } from './support/labels.js';

function page(html) {
  return parseHTML(`<html><body><div id="root">${html}</div></body></html>`).document.getElementById('root');
}

test('fieldByLabel follows for to the control with that id', () => {
  const root = page('<label for="a">Category</label><select id="a"></select>');
  assert.equal(fieldByLabel(root, 'Category').localName, 'select');
});

test('fieldByLabel finds a control wrapped by the label', () => {
  const root = page('<label>Title <input id="t"></label>');
  assert.equal(fieldByLabel(root, 'Title').getAttribute('id'), 't');
});

test('fieldByLabel throws for a label with no for and no control', () => {
  const root = page('<label>Rule</label><textarea id="r"></textarea>');
  assert.throws(() => fieldByLabel(root, 'Rule'), /no for and wraps no control/);
});

test('fieldByLabel throws when the id is missing or is not a control', () => {
  assert.throws(() => fieldByLabel(page('<label for="x">Act</label>'), 'Act'), /not in the page/);
  assert.throws(() => fieldByLabel(page('<label for="d">Act</label><div id="d"></div>'), 'Act'), /not a form control/);
});
