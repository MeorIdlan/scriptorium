import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support/render.js';
import { rowLeaveFocus } from '../src/utils/rowLeave.js';

// Rows as the lists render them: one li per row, each with its action button
function rows(n) {
  return Array.from({ length: n }, (_, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `row ${i}`;
    li.appendChild(button);
    return li;
  });
}

test('a row leaving the middle of the list targets the next row', () => {
  const list = rows(3);
  assert.equal(rowLeaveFocus(list, 1).current === list[2].querySelector('button'), true);
});

test('the last row leaving targets the previous row', () => {
  const list = rows(3);
  assert.equal(rowLeaveFocus(list, 2).current === list[1].querySelector('button'), true);
});

test('the only row leaving targets the fallback button', () => {
  const list = rows(1);
  const add = document.createElement('button');
  assert.equal(rowLeaveFocus(list, 0, add).current === add, true);
});

test('with no row and no fallback there is nothing to focus', () => {
  assert.equal(rowLeaveFocus(rows(1), 0), null);
});

test('a neighbour without a button is skipped for the one beyond it', () => {
  const list = rows(3);
  list[2].querySelector('button').remove();
  assert.equal(rowLeaveFocus(list, 1).current === list[0].querySelector('button'), true);
});

test('a list can pick its own action in each row', () => {
  const list = rows(3);
  const named = list.map((li) => {
    const name = document.createElement('button');
    name.className = 'name';
    li.appendChild(name);
    return name;
  });
  const pick = (row) => row.querySelector('.name');
  assert.equal(rowLeaveFocus(list, 1, null, pick).current === named[2], true);
});
