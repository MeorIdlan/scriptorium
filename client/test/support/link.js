// A real left click on a link: react-router ignores a click that has no button 0.
// linkedom has no MouseEvent, so this is an Event with `button` defined.
import { act, flush } from './render.js';

export async function clickLink(el) {
  await act(async () => {
    const event = new window.Event('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'button', { value: 0 });
    el.dispatchEvent(event);
  });
  await flush();
}
