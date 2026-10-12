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

export async function render(element) {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await flush();
  return {
    container,
    async rerender(next) {
      await act(async () => root.render(next));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

// Clicks an element and waits for the resulting updates
export async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await flush();
}
