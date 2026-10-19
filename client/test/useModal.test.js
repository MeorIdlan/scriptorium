import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useRef } from 'react';
import { render, flush, click, act } from './support/render.js';
import './support/focus.js';
import { useModal } from '../src/hooks/useModal.js';

// A minimal overlay: backdrop around the dialog, wired the way Task 4 will wire
// the real modals
function Modal({ onClose, initialFocusRef, trap, children }) {
  const { dialogProps, backdropProps } = useModal({ onClose, initialFocusRef, trap });
  return h('div', { className: 'modal-backdrop', ...backdropProps },
    h('div', { className: 'modal', ...dialogProps }, children));
}

// Presses a key on an element and returns the event, so the test can read
// defaultPrevented after React's handlers have run
async function keyDown(el, key, { shiftKey = false } = {}) {
  let event;
  await act(async () => {
    event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { key: { value: key }, shiftKey: { value: shiftKey } });
    el.dispatchEvent(event);
  });
  await flush();
  return event;
}

test('focuses the first focusable element on open', async () => {
  const view = await render(h(Modal, { onClose() {} },
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'second' }, 'Second')));
  const first = view.container.querySelector('#first');
  assert.equal(document.activeElement === first, true);
  await view.unmount();
});

test('Tab from the last element wraps to the first; Shift+Tab from the first wraps to the last', async () => {
  const view = await render(h(Modal, { onClose() {} },
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'middle' }, 'Middle'),
    h('button', { id: 'last' }, 'Last')));
  const first = view.container.querySelector('#first');
  const middle = view.container.querySelector('#middle');
  const last = view.container.querySelector('#last');

  last.focus();
  const forward = await keyDown(last, 'Tab');
  assert.equal(forward.defaultPrevented, true);
  assert.equal(document.activeElement === first, true);

  first.focus();
  const backward = await keyDown(first, 'Tab', { shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(document.activeElement === last, true);

  // Between the ends, Tab is left to the browser
  middle.focus();
  const inside = await keyDown(middle, 'Tab');
  assert.equal(inside.defaultPrevented, false);
  await view.unmount();
});

test('Shift+Tab with the dialog itself focused wraps to the last focusable element', async () => {
  const view = await render(h(Modal, { onClose() {} },
    h('p', null, 'Some text'),
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'last' }, 'Last')));
  const dialog = view.container.querySelector('.modal');
  const last = view.container.querySelector('#last');

  // Focus lands on the dialog after clicking non-focusable text inside it
  dialog.focus();
  const event = await keyDown(dialog, 'Tab', { shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement === last, true);
  await view.unmount();
});

test('a hidden input is not treated as the last focusable element', async () => {
  const view = await render(h(Modal, { onClose() {} },
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'last' }, 'Last'),
    h('input', { id: 'token', type: 'hidden', value: 'x' })));
  const first = view.container.querySelector('#first');
  const last = view.container.querySelector('#last');

  last.focus();
  const event = await keyDown(last, 'Tab');
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement === first, true);
  await view.unmount();
});

test('Esc calls onClose once and does not reach a document keydown listener', async () => {
  let closes = 0;
  const view = await render(h(Modal, { onClose: () => closes++ },
    h('button', { id: 'first' }, 'First')));
  const outer = [];
  const listener = (e) => outer.push(e.key);
  document.addEventListener('keydown', listener);
  try {
    const event = await keyDown(view.container.querySelector('#first'), 'Escape');
    assert.equal(event.defaultPrevented, true);
    assert.equal(closes, 1);
    assert.deepEqual(outer, []);
  } finally {
    document.removeEventListener('keydown', listener);
  }
  await view.unmount();
});

test('returns focus to the opener on close', async () => {
  const opener = await render(h('button', { id: 'opener' }, 'Open'));
  const openerEl = opener.container.querySelector('#opener');
  openerEl.focus();

  const view = await render(h(Modal, { onClose() {} },
    h('button', { id: 'first' }, 'First')));
  assert.equal(document.activeElement === view.container.querySelector('#first'), true);

  await view.unmount();
  assert.equal(document.activeElement === openerEl, true);
  await opener.unmount();
});

test('does not throw when the opener was removed before close', async () => {
  const opener = await render(h('button', { id: 'opener' }, 'Open'));
  const openerEl = opener.container.querySelector('#opener');
  openerEl.focus();

  const view = await render(h(Modal, { onClose() {} },
    h('button', { id: 'first' }, 'First')));
  await opener.unmount();

  await assert.doesNotReject(view.unmount());
  assert.equal(document.activeElement === openerEl, false);
});

test('a dialog with no focusable children keeps focus on itself when Tab is pressed', async () => {
  const view = await render(h(Modal, { onClose() {} }, h('p', null, 'Just text')));
  const dialog = view.container.querySelector('.modal');
  assert.equal(document.activeElement === dialog, true);

  const event = await keyDown(dialog, 'Tab');
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement === dialog, true);
  await view.unmount();
});

test('backdrop click closes; click inside the dialog does not', async () => {
  let closes = 0;
  const view = await render(h(Modal, { onClose: () => closes++ },
    h('button', { id: 'first' }, 'First')));
  await click(view.container.querySelector('#first'));
  assert.equal(closes, 0);

  await click(view.container.querySelector('.modal-backdrop'));
  assert.equal(closes, 1);
  await view.unmount();
});

test('dialog has role=dialog and aria-modal=true', async () => {
  const view = await render(h(Modal, { onClose() {} }, h('p', null, 'Text')));
  const dialog = view.container.querySelector('.modal');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  await view.unmount();
});

test('initialFocusRef takes focus on open instead of the first focusable element', async () => {
  function WithRef() {
    const ref = useRef(null);
    return h(Modal, { onClose() {}, initialFocusRef: ref },
      h('button', { id: 'first' }, 'First'),
      h('button', { id: 'second', ref }, 'Second'));
  }
  const view = await render(h(WithRef));
  assert.equal(document.activeElement === view.container.querySelector('#second'), true);
  await view.unmount();
});

test('trap: false leaves the dialog without aria-modal', async () => {
  const view = await render(h(Modal, { onClose() {}, trap: false }, h('button', null, 'First')));
  const dialog = view.container.querySelector('.modal');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.hasAttribute('aria-modal'), false);
  await view.unmount();
});

test('trap: false does not wrap Tab or Shift+Tab at the ends', async () => {
  const view = await render(h(Modal, { onClose() {}, trap: false },
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'last' }, 'Last')));
  const first = view.container.querySelector('#first');
  const last = view.container.querySelector('#last');

  last.focus();
  const forward = await keyDown(last, 'Tab');
  assert.equal(forward.defaultPrevented, false);
  assert.equal(document.activeElement === last, true);

  first.focus();
  const backward = await keyDown(first, 'Tab', { shiftKey: true });
  assert.equal(backward.defaultPrevented, false);
  assert.equal(document.activeElement === first, true);
  await view.unmount();
});

test('trap: false still closes on Esc from inside the dialog', async () => {
  let closes = 0;
  const view = await render(h(Modal, { onClose: () => closes++, trap: false },
    h('button', { id: 'first' }, 'First')));
  const event = await keyDown(view.container.querySelector('#first'), 'Escape');
  assert.equal(event.defaultPrevented, true);
  assert.equal(closes, 1);
  await view.unmount();
});
