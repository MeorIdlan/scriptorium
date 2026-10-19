import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp, HttpError } from './support/app.js';
// After the support imports: render.js must set up the DOM before react-dom loads
import { useNavigate, useLocation } from 'react-router-dom';
import App from '../src/App.jsx';
import { useEditor } from '../src/context/EditorContext.jsx';
import { pageKey } from '../src/utils/pageKey.js';

const chapter = (id, n) => ({ id, number: n, title: `Title ${id}`, wordCount: 1 });
const body = (id) => ({ id, content: `text of ${id}`, contentHtml: `<p>text of ${id}</p>` });

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
  'GET /works/w1/chapters': [chapter('c1', 1), chapter('c2', 2)],
  'GET /works/w1/chapters/c1': body('c1'),
  'GET /works/w1/chapters/c2': body('c2'),
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'GET /works/w1/threads': [],
  'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
};

const count = (view, method, path) => view.fetch.calls.filter((c) => c.method === method && c.path === path).length;

test('pageKey keeps one page for every chapter of a work', () => {
  assert.equal(pageKey('/work/w1/chapter/c2'), '/work/w1');
  assert.equal(pageKey('/work/w1'), '/work/w1');
  assert.equal(pageKey('/work/w1/map'), '/work/w1/map');
  assert.equal(pageKey('/work/w1/codex'), '/work/w1/codex');
  assert.equal(pageKey('/'), '/');
});

test('switching chapters inside the app keeps the Main Room and saves once', async () => {
  const view = await renderApp(h(App), { routes, path: '/work/w1/chapter/c1' });
  assert.equal(view.query('.editor').textContent, 'text of c1');
  const el = view.query('.editor');
  await act(async () => {
    el.innerHTML = '<p>text of c1 and more</p>';
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
  await click(view.button('Title c2'));
  assert.equal(view.query('.editor').textContent, 'text of c2');
  // The work isn't reloaded and the room's loading page never shows
  assert.equal(count(view, 'GET', '/works/w1'), 1);
  assert.equal(count(view, 'GET', '/works/w1/chapters/c2'), 1);
  assert.deepEqual(
    view.fetch.calls.filter((c) => c.method === 'PUT').map((c) => [c.path, c.body.content]),
    [['/works/w1/chapters/c1', 'text of c1 and more']]
  );
});

let navigate;
let location;
let editor;
function Probe() {
  navigate = useNavigate();
  location = useLocation();
  editor = useEditor();
  return null;
}

const sideRoutes = (w) => ({
  [`GET /works/${w}/catches`]: [],
  [`GET /works/${w}/codex`]: {},
  [`GET /works/${w}/map`]: {},
  [`GET /works/${w}/threads`]: [],
});

async function go(path) {
  await act(async () => navigate(path));
  await flush();
}

async function quietly(fn) {
  const logged = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = logged;
  }
}

for (const workFirst of [false, true]) {
  test(`opening a second work never opens the first work's chapter (${workFirst ? 'work' : 'stale reply'} first)`, async () => {
    let releaseW2;
    const w2Ready = new Promise((r) => (releaseW2 = r));
    const view = await renderApp(h(Fragment, null, h(App), h(Probe)), {
      path: '/work/w1/chapter/a1',
      routes: {
        ...sideRoutes('w1'),
        ...sideRoutes('w2'),
        'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
        'GET /works/w1': { id: 'w1', title: 'One', currentChapterId: 'a1' },
        'GET /works/w1/chapters': [chapter('a1', 1)],
        'GET /works/w1/chapters/a1': body('a1'),
        'GET /works/w2': async () => (await w2Ready, { id: 'w2', title: 'Two', currentChapterId: 'b1' }),
        'GET /works/w2/chapters': async () => (await w2Ready, [chapter('b1', 1), chapter('b2', 2)]),
        'GET /works/w2/chapters/a1': new HttpError(404, 'NOT_FOUND'),
        'GET /works/w2/chapters/b1': body('b1'),
      },
    });
    await go('/');
    await quietly(async () => {
      await go('/work/w2');
      if (workFirst) await act(async () => releaseW2());
      await flush();
      await act(async () => releaseW2());
      await flush();
    });
    assert.equal(count(view, 'GET', '/works/w2/chapters/a1'), 0);
    assert.equal(location.pathname, '/work/w2');
    assert.equal(editor.state.chapterId, 'b1');
    assert.equal(view.query('.editor').textContent, 'text of b1');
  });
}

test('a chapter that fails to load after the Map stays read-only until it loads', async () => {
  let failing = false;
  const view = await renderApp(h(Fragment, null, h(App), h(Probe)), {
    path: '/work/w1/chapter/c2',
    routes: {
      ...routes,
      'GET /works/w1/chapters/c2': () => (failing ? new HttpError(500, 'SERVER_ERROR') : body('c2')),
    },
  });
  await go('/work/w1/map');
  failing = true;
  await quietly(() => go('/work/w1/chapter/c2'));
  // The context still says c2, but this page has none of its text: typing now would overwrite it
  assert.equal(editor.state.chapterId, 'c2');
  assert.equal(view.query('.editor').getAttribute('contenteditable'), 'false');
  assert.match(view.text(), /Couldn’t load this chapter/);
  failing = false;
  await click(view.button('Title c2'));
  assert.equal(view.query('.editor').getAttribute('contenteditable'), 'true');
  assert.equal(view.query('.editor').textContent, 'text of c2');
  assert.doesNotMatch(view.text(), /Couldn’t load this chapter/);
});
