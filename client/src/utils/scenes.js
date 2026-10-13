// Scenes inside the editor: each starts with a top-level
// <hr data-scene …> whose attributes hold the scene's card.
import { getBlocks, blockEndPoint, topLevelNode, rememberedCaret } from './editorBlocks.js';
import { countWords } from './wordCount.js';
import { parseThreadIds, tagList } from './threads.js';

export const SCENE_STATUSES = ['todo', 'draft', 'revise', 'done'];
export const STATUS_LABELS = { todo: 'To do', draft: 'Draft', revise: 'Revise', done: 'Done' };
export const SCENE_LIMITS = { title: 120, pov: 60, location: 80, summary: 600 };
const ATTRS = { title: 'data-title', pov: 'data-pov', location: 'data-location', summary: 'data-summary' };

export function newSceneId(now = Date.now()) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(3));
  return `scn_${now}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const isMarker = (node) => node?.nodeType === 1 && node.tagName === 'HR' && node.hasAttribute('data-scene');

function cardOf(marker) {
  if (!marker) return { id: null, title: '', pov: '', location: '', status: 'draft', summary: '', threadIds: [] };
  const card = { id: marker.getAttribute('data-scene') };
  for (const [field, attr] of Object.entries(ATTRS)) card[field] = marker.getAttribute(attr) || '';
  const status = marker.getAttribute('data-status');
  card.status = SCENE_STATUSES.includes(status) ? status : 'draft';
  card.threadIds = parseThreadIds(marker.getAttribute('data-threads'));
  return card;
}

export function sceneList(root) {
  const segments = [{ marker: null, blocks: [] }];
  for (const block of getBlocks(root)) {
    if (block.nodes.length === 1 && isMarker(block.nodes[0])) segments.push({ marker: block.nodes[0], blocks: [] });
    else segments[segments.length - 1].blocks.push(block);
  }
  const hasMarkers = segments.length > 1;
  return segments
    .map((seg) => {
      const text = seg.blocks.map((b) => b.text).join('\n').trim();
      return { ...cardOf(seg.marker), marker: seg.marker, blocks: seg.blocks, text, wordCount: countWords(text) };
    })
    .filter((scene, i) => i > 0 || !hasMarkers || scene.text !== '')
    .map((scene, index) => ({ ...scene, index }));
}

// Walks top-level nodes only, so it is cheap enough for every caret move
export function sceneAtNode(root, node, list = sceneList(root)) {
  if (!node || node.parentNode !== root) return -1;
  let marker = null;
  for (const child of root.childNodes) {
    if (isMarker(child)) marker = child;
    if (child === node) break;
  }
  const index = list.findIndex((s) => s.marker === marker);
  return index >= 0 ? index : 0;
}

export function sceneAtCaret(root) {
  if (!root) return null;
  const list = sceneList(root);
  if (!list.some((s) => s.id)) return null;
  const index = sceneAtNode(root, rememberedCaret(root), list);
  return index >= 0 ? list[index] : null;
}

export function sceneLabel(scene) {
  return scene.title?.trim() || `Scene ${scene.index + 1}`;
}

const formatCount = (n) => n.toLocaleString('en-US');

export function sceneFieldError(field, value) {
  const length = (value || '').trim().length;
  const limit = SCENE_LIMITS[field];
  return length > limit ? `${formatCount(length)} / ${formatCount(limit)} characters. Shorten it to save.` : '';
}

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function markerHtml({ id, status = 'draft', ...fields }) {
  const attrs = [`data-scene="${escapeAttr(id)}"`];
  for (const [field, attr] of Object.entries(ATTRS)) {
    const value = (fields[field] || '').trim();
    if (value) attrs.push(`${attr}="${escapeAttr(value)}"`);
  }
  const threads = tagList(fields.threadIds);
  if (threads.length) attrs.push(`data-threads="${escapeAttr(threads.join(' '))}"`);
  attrs.push(`data-status="${SCENE_STATUSES.includes(status) ? status : 'draft'}"`);
  attrs.push('contenteditable="false"');
  return `<hr ${attrs.join(' ')}>`;
}

export function applyCard(marker, fields) {
  for (const [field, attr] of Object.entries(ATTRS)) {
    const value = (fields[field] || '').trim();
    if (value) marker.setAttribute(attr, value);
    else marker.removeAttribute(attr);
  }
  // Card edits don't carry tags; only change them when asked to
  if ('threadIds' in fields) {
    const threads = tagList(fields.threadIds);
    if (threads.length) marker.setAttribute('data-threads', threads.join(' '));
    else marker.removeAttribute('data-threads');
  }
  marker.setAttribute('data-status', SCENE_STATUSES.includes(fields.status) ? fields.status : 'draft');
}

// linkedom (tests) and the browser each have their own Event class
const fireInput = (root) => {
  const EventClass = root.ownerDocument.defaultView?.Event || globalThis.Event;
  root.dispatchEvent(new EventClass('input', { bubbles: true }));
};

// Not in the browser's undo history; the writer can edit the card again
export function writeSceneCard(root, index, fields) {
  const scene = sceneList(root)[index];
  if (!scene) return false;
  let marker = scene.marker;
  if (!marker) {
    marker = root.ownerDocument.createElement('hr');
    marker.setAttribute('data-scene', newSceneId());
    marker.setAttribute('contenteditable', 'false');
    root.insertBefore(marker, root.firstChild);
  }
  applyCard(marker, fields);
  fireInput(root);
  return true;
}

const SAFE_ID = /^[\w-]{1,64}$/;

// Pasted rules come in without an id, with a copied id, or editable: every
// top-level <hr> becomes a locked marker with an id unique in the chapter,
// matching what the server's sanitizer will store
export function normalizeMarkers(root) {
  let changed = 0;
  const seen = new Set();
  for (const child of root.children) {
    if (child.tagName !== 'HR') continue;
    let id = child.getAttribute('data-scene') || '';
    if (!SAFE_ID.test(id) || seen.has(id)) {
      id = newSceneId();
      child.setAttribute('data-scene', id);
      changed += 1;
    } else if (child.getAttribute('contenteditable') !== 'false') {
      changed += 1;
    }
    seen.add(id);
    child.setAttribute('contenteditable', 'false');
  }
  return changed;
}

export function lockMarkers(root) {
  return normalizeMarkers(root);
}

// Chrome can put inserted HTML inside the caret's block; a marker only
// splits scenes at the top level
export function liftMarker(root, marker) {
  const top = topLevelNode(root, marker);
  if (!top || top === marker) return;
  const rest = [];
  for (let n = marker.nextSibling; n; n = n.nextSibling) rest.push(n);
  root.insertBefore(marker, top.nextSibling);
  if (rest.length) {
    const after = root.ownerDocument.createElement(top.tagName.toLowerCase());
    rest.forEach((n) => after.appendChild(n));
    if (after.textContent.trim() || after.querySelector('br')) root.insertBefore(after, marker.nextSibling);
  }
}

// Positions in a destination chapter; `moving` is the scene's own place when
// the destination is its own chapter (toIndex then counts without it)
export function positionOptions(destScenes, moving = null) {
  const rest = destScenes.filter((s) => !moving || s.index !== moving.index);
  const options = [{ label: 'At the start', toIndex: 0 }];
  rest.forEach((scene, pos) => {
    if (pos < rest.length - 1) options.push({ label: `After: ${sceneLabel(scene)}`, toIndex: pos + 1 });
  });
  if (rest.length > 0) options.push({ label: 'At the end', toIndex: rest.length });
  return moving ? options.filter((o) => o.toIndex !== moving.index) : options;
}

// Top-level point after the caret's block (or its line, in a legacy
// plain-text run), so the marker never lands inside a paragraph
export function afterBlockPoint(root, caretNode) {
  const blocks = getBlocks(root);
  if (blocks.length === 0) return { node: root, offset: 0 };
  const block = (caretNode && blocks.find((b) => b.nodes.includes(caretNode))) || blocks[blocks.length - 1];
  if (block.nodes.length === 1 && block.nodes[0].nodeType === 1) {
    return { node: root, offset: [...root.childNodes].indexOf(block.nodes[0]) + 1 };
  }
  return blockEndPoint(root, caretNode);
}

function select(doc, setup) {
  const range = doc.createRange();
  setup(range);
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// execCommand keeps the break in the browser's undo history and fires input
export function insertSceneBreak(root, caretNode) {
  const doc = root.ownerDocument;
  const point = afterBlockPoint(root, caretNode);
  root.focus();
  select(doc, (r) => {
    r.setStart(point.node, point.offset);
    r.collapse(true);
  });
  const id = newSceneId();
  const ok = doc.execCommand('insertHTML', false, `${markerHtml({ id })}<div><br></div>`);
  const marker = [...root.querySelectorAll('hr')].find((h) => h.getAttribute('data-scene') === id);
  if (!marker) return false;
  if (marker.parentNode !== root) liftMarker(root, marker);
  lockMarkers(root);
  const next = marker.nextSibling;
  if (next) {
    select(doc, (r) => {
      r.setStart(next, 0);
      r.collapse(true);
    });
  }
  return ok;
}

export function removeSceneBreak(root, marker) {
  if (!marker || marker.parentNode !== root) return false;
  const doc = root.ownerDocument;
  root.focus();
  select(doc, (r) => r.selectNode(marker));
  doc.execCommand('delete');
  // Fallback when the browser refuses to delete a non-editable node
  if (marker.parentNode) {
    marker.remove();
    fireInput(root);
  }
  return true;
}

export function scrollToScene(root, scene) {
  if (!scene) return;
  const doc = root.ownerDocument;
  (scene.marker || root).scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  root.focus();
  const first = scene.blocks[0]?.nodes[0];
  select(doc, (r) => {
    if (first) r.setStart(first, 0);
    else r.setStart(root, scene.marker ? [...root.childNodes].indexOf(scene.marker) + 1 : 0);
    r.collapse(true);
  });
}
