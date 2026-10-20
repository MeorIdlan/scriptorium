import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp, HttpError } from './support/app.js';
import { act, flush } from './support/render.js';
import ChapterDetail from '../src/components/map/ChapterDetail.jsx';

const chapters = [{ id: 'c1', title: 'One', wordCount: 900, beat: null, summaryStatus: 'none', scenes: [] }];

function openChapter() {
  return renderApp(h(ChapterDetail, { workId: 'w1', chapterId: 'c1', chapters, onSaved() {} }));
}

// Moves the slider the way an arrow key does: the value changes, then the key is released
async function arrowKey(slider, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(slider, String(value));
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
  await releaseKey(slider, 'ArrowRight');
}

// Releases a key on the slider, as a keyboard user does after moving or passing it
async function releaseKey(slider, key) {
  await act(async () => {
    const event = new window.Event('keyup', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    slider.dispatchEvent(event);
  });
  await flush();
}

function tensionSaves(view) {
  return view.fetch.calls.filter((c) => c.method === 'PUT' && c.path === '/works/w1/map/chapters/c1' && 'tensionScore' in c.body);
}

test('a tension change made with the arrow keys is saved when the key is released', async () => {
  const view = await openChapter();
  await arrowKey(view.query('.tension-slider'), 70);
  assert.deepEqual(tensionSaves(view).map((c) => c.body), [{ tensionScore: 70 }]);
  await view.unmount();
});

test('an arrow key that leaves the value at the saved one does not save', async () => {
  const view = await openChapter();
  await arrowKey(view.query('.tension-slider'), 50);
  assert.deepEqual(tensionSaves(view), []);
  await view.unmount();
});

test('Tab onto the slider and Shift do not save the unchanged tension', async () => {
  const view = await openChapter();
  const slider = view.query('.tension-slider');
  await releaseKey(slider, 'Tab');
  await releaseKey(slider, 'Shift');
  assert.deepEqual(tensionSaves(view), []);
  await view.unmount();
});

test('a tension the server refused is sent again on the next key release', async () => {
  let refuse = true;
  const view = await renderApp(h(ChapterDetail, { workId: 'w1', chapterId: 'c1', chapters, onSaved() {} }), {
    routes: {
      'PUT /works/w1/map/chapters/c1': () => {
        if (!refuse) return {};
        refuse = false;
        return new HttpError(500, 'SERVER_ERROR', 'Could not save');
      },
    },
  });
  const slider = view.query('.tension-slider');
  await arrowKey(slider, 70);
  await arrowKey(slider, 70);
  assert.deepEqual(tensionSaves(view).map((c) => c.body), [{ tensionScore: 70 }, { tensionScore: 70 }]);
  await view.unmount();
});
