// Shared setup for component tests: a fetch stub that records every request,
// and a wrapper with the app's providers
import { createElement as h } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach } from 'node:test';
import { render, cleanup } from './render.js';
import { AuthProvider } from '../../src/context/AuthContext.jsx';
import { WorksProvider } from '../../src/context/WorksContext.jsx';
import { ActiveWorkProvider } from '../../src/context/ActiveWorkContext.jsx';
import { EditorProvider } from '../../src/context/EditorContext.jsx';
import { UIProvider } from '../../src/context/UIContext.jsx';
import { AiProvider } from '../../src/context/AiContext.jsx';

afterEach(cleanup);

export function aiSettings(on) {
  return { aiEnabled: on, aiAvailable: on, activeProvider: 'anthropic', autoFeatures: { rekindler: 'prompt' } };
}

// A route reply that makes the stub answer with an API error
export class HttpError {
  constructor(status, code, message = code) {
    Object.assign(this, { status, code, message });
  }
}

// routes: { 'GET /works': [...], 'POST /ai/hooks': {...} }; a function value
// gets (body) and returns the reply. Unknown requests reply {}.
export function stubFetch(routes = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path.split('?')[0]}`;
    let reply = key in routes ? routes[key] : {};
    if (typeof reply === 'function') reply = reply(body);
    const status = reply instanceof HttpError ? reply.status : 200;
    const json = reply instanceof HttpError ? { error: reply.message, code: reply.code } : reply;
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return {
    calls,
    aiCalls: () => calls.filter((c) => c.path.startsWith('/ai/')),
  };
}

// Renders `element` at `path` (matched against `route`) inside every app
// provider, signed in, with AI on or off as the server would report it
export async function renderApp(element, { ai = false, routes = {}, path = '/', route = '*' } = {}) {
  let settings = aiSettings(ai);
  const fetchStub = stubFetch({
    'GET /auth/me': { id: 'user_1', email: 'w@example.com', scope: 'full' },
    'GET /works': [],
    'GET /auth/passkeys': [],
    'GET /settings/providers': [],
    'GET /settings': () => settings,
    ...routes,
  });
  const tree = h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null,
      h(AiProvider, null,
        h(WorksProvider, null,
          h(ActiveWorkProvider, null,
            h(EditorProvider, null,
              h(UIProvider, null,
                h(Routes, null, h(Route, { path: route, element }))))))))
  );
  const view = await render(tree);
  return {
    ...view,
    fetch: fetchStub,
    // What GET /settings returns from now on
    setServerAi(on) {
      settings = aiSettings(on);
    },
    text: () => view.container.textContent,
    query: (sel) => view.container.querySelector(sel),
    queryAll: (sel) => [...view.container.querySelectorAll(sel)],
    // Booleans and text only in asserts: a failing assert on a linkedom node
    // tries to print the whole document and never finishes
    hasButton(label) {
      return Boolean(this.button(label));
    },
    button: (label) =>
      [...view.container.querySelectorAll('button')].find((b) =>
        typeof label === 'string' ? b.textContent.includes(label) : label.test(b.textContent)
      ),
  };
}
