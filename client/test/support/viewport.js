// A window.matchMedia stand-in for linkedom, which has none. It understands only
// min-width / max-width and (pointer: coarse | fine), joined by "and", which is all
// the layout modes and the touch checks use.
// setViewport(width) sets the width and tells every media query list that has
// listeners attached; setPointer('coarse') does the same for the pointer;
// resetViewport() removes the stub. Test infrastructure only.
const { window } = globalThis;

let width = 1280;
let pointer = 'fine';
const lists = new Set();

function matches(query) {
  const clauses = query.split(/\s+and\s+/);
  return clauses.every((clause) => {
    const p = clause.match(/\(\s*pointer:\s*(coarse|fine)\s*\)/);
    if (p) return p[1] === pointer;
    const m = clause.match(/\(\s*(min|max)-width:\s*(\d+)px\s*\)/);
    if (!m) return false;
    return m[1] === 'min' ? width >= Number(m[2]) : width <= Number(m[2]);
  });
}

function createList(query) {
  const listeners = new Set();
  const list = {
    media: query,
    matches: matches(query),
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'change') listeners.delete(fn);
    },
    addListener(fn) {
      listeners.add(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
    },
    refresh() {
      const next = matches(query);
      if (next === list.matches) return;
      list.matches = next;
      for (const fn of [...listeners]) fn({ matches: next, media: query });
    },
  };
  lists.add(list);
  return list;
}

export function setViewport(nextWidth) {
  width = nextWidth;
  window.innerWidth = nextWidth;
  window.matchMedia = (query) => createList(query);
  for (const list of [...lists]) list.refresh();
}

export function setPointer(next) {
  pointer = next;
  if (typeof window.matchMedia !== 'function') window.matchMedia = (query) => createList(query);
  for (const list of [...lists]) list.refresh();
}

export function resetViewport() {
  delete window.matchMedia;
  window.innerWidth = 1024;
  width = 1280;
  pointer = 'fine';
  lists.clear();
}
