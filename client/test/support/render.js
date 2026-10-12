// Renders React elements into a linkedom document for component tests
import { parseHTML } from 'linkedom';

const { window } = parseHTML('<!doctype html><html><body></body></html>');

// react-dom reads these globals when it loads, so set them before importing it
globalThis.window = window;
globalThis.document = window.document;
for (const key of ['HTMLElement', 'HTMLIFrameElement', 'Node', 'MutationObserver']) {
  if (!(key in globalThis)) globalThis[key] = window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// react-dom checks `'oninput' in document` when it loads; linkedom has no
// on* properties, which would switch React to its focus/keyup polyfill
for (const name of ['oninput', 'onchange']) window.document[name] ??= null;
window.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
window.cancelAnimationFrame ??= (id) => clearTimeout(id);
window.sessionStorage ??= memoryStorage();
window.localStorage ??= memoryStorage();
globalThis.sessionStorage ??= window.sessionStorage;
globalThis.localStorage ??= window.localStorage;

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

export { act };

// Lets pending promises (fetches, effects) settle inside act()
export async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

// Roots still mounted, so a failed test can't leave timers running
const mounted = new Set();

export async function cleanup() {
  for (const unmount of [...mounted]) await unmount();
}

export async function render(element) {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  async function unmount() {
    if (!mounted.delete(unmount)) return;
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.add(unmount);
  await act(async () => root.render(element));
  await flush();
  return {
    container,
    async rerender(next) {
      await act(async () => root.render(next));
      await flush();
    },
    unmount,
  };
}

// React tracks input values through a setter on the element itself; set the
// value through the prototype's setter so React sees a real change
function setNative(el, prop, value) {
  let proto = Object.getPrototypeOf(el);
  while (proto && !Object.getOwnPropertyDescriptor(proto, prop)) proto = Object.getPrototypeOf(proto);
  // linkedom has no `checked` accessor, so React doesn't track it either
  if (!proto) el[prop] = value;
  else Object.getOwnPropertyDescriptor(proto, prop).set.call(el, value);
}

// Types into an input or textarea
export async function type(el, value) {
  await act(async () => {
    setNative(el, 'value', value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
}

// Checks or unchecks a checkbox the way a click would
export async function toggle(el, checked) {
  await act(async () => {
    setNative(el, 'checked', checked);
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await flush();
}

// Clicks an element and waits for the resulting updates
export async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await flush();
}

// Presses a key on an element (React reads event.key)
export async function press(el, key) {
  await act(async () => {
    const event = new window.Event('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: key });
    el.dispatchEvent(event);
  });
  await flush();
}

// React's onBlur listens for focusout
export async function blur(el) {
  await act(async () => {
    el.dispatchEvent(new window.Event('focusout', { bubbles: true }));
  });
  await flush();
}
