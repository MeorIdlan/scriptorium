// The Main Room lives at /work/<id> and /work/<id>/chapter/<id>; the Map and the
// Codex are /work/<id>/map and /work/<id>/codex
export function isMainRoomPath(pathname) {
  return /^\/work\/[^/]+(\/chapter\/[^/]+)?\/?$/.test(pathname);
}
