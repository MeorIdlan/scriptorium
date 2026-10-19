// The key the layout gives the current page. Every chapter of a work is the
// same page (the Main Room), so switching chapters doesn't remount it and
// reload the work; moving between rooms still replays the page-enter animation.
export function pageKey(pathname) {
  return pathname.replace(/^(\/work\/[^/]+)\/chapter\/[^/]+\/?$/, '$1');
}
