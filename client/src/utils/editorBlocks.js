// Maps the contentEditable DOM to "blocks" (paragraph lines) with plain-text
// offsets, the coordinate system Polish targets and changes use.
import { sentenceSpans } from './polishDiff.js';
import { countWords } from './wordCount.js';

const ELEMENT = 1;
const TEXT = 3;
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

const isBlockElement = (node) => node.nodeType === ELEMENT && BLOCK_TAGS.has(node.tagName);
const holds = (node, other) => node === other || (node.nodeType === ELEMENT && node.contains(other));

export function blockPieces(nodes) {
  const pieces = [];
  let text = '';
  let closedBlock = null; // nested block just ended; the next content starts a new line
  const breakAfterBlock = () => {
    if (closedBlock && text && !text.endsWith('\n')) {
      pieces.push({ kind: 'virtual-after', node: closedBlock, start: text.length, end: text.length + 1 });
      text += '\n';
    }
    closedBlock = null;
  };
  const walk = (node, nested) => {
    if (node.nodeType === TEXT) {
      if (node.data) breakAfterBlock();
      pieces.push({ kind: 'text', node, start: text.length, end: text.length + node.data.length });
      text += node.data;
      return;
    }
    if (node.nodeType !== ELEMENT) return;
    if (node.tagName === 'BR') {
      breakAfterBlock();
      pieces.push({ kind: 'break', node, start: text.length, end: text.length + 1 });
      text += '\n';
      return;
    }
    // A pasted nested <div> starts a new line inside this block
    if (isBlockElement(node)) closedBlock = null;
    if (isBlockElement(node) && text && !text.endsWith('\n')) {
      pieces.push({ kind: 'virtual', node, start: text.length, end: text.length + 1 });
      text += '\n';
    }
    for (const child of [...node.childNodes]) walk(child, true);
    if (nested && isBlockElement(node)) closedBlock = node;
  };
  for (const node of nodes) walk(node, false);
  return { pieces, text };
}

// Chrome leaves the first line as bare inline nodes before the first <div>
export function getBlocks(root) {
  const groups = [];
  let run = null;
  for (const node of [...root.childNodes]) {
    if (isBlockElement(node)) {
      run = null;
      groups.push([node]);
    } else {
      if (!run) {
        run = [];
        groups.push(run);
      }
      run.push(node);
    }
  }
  return groups.map((nodes, index) => ({ index, nodes, text: blockPieces(nodes).text }));
}

export function pointToBlockOffset(root, blocks, container, offset) {
  if (container === root) {
    const child = root.childNodes[offset];
    if (!child) {
      const last = blocks[blocks.length - 1];
      return last ? { blockIndex: last.index, offset: last.text.length } : null;
    }
    const block = blocks.find((b) => b.nodes.includes(child));
    return block ? { blockIndex: block.index, offset: 0 } : null;
  }

  const block = blocks.find((b) => b.nodes.some((n) => holds(n, container)));
  if (!block) return null;
  const { pieces } = blockPieces(block.nodes);

  if (container.nodeType === TEXT) {
    const piece = pieces.find((p) => p.node === container);
    return piece ? { blockIndex: block.index, offset: piece.start + offset } : null;
  }

  const child = container.childNodes[offset];
  if (child) {
    const piece = pieces.find((p) => holds(child, p.node));
    if (piece) return { blockIndex: block.index, offset: piece.start };
  }
  const inside = pieces.filter((p) => holds(container, p.node));
  if (inside.length) return { blockIndex: block.index, offset: inside[inside.length - 1].end };
  return { blockIndex: block.index, offset: 0 };
}

function trimmedTarget(blockIndex, text, start, end) {
  const slice = text.slice(start, end);
  const s = start + (slice.length - slice.trimStart().length);
  const e = start + slice.trimEnd().length;
  if (e <= s) return null;
  return { blockIndex, start: s, end: e, text: text.slice(s, e) };
}

export function chapterTargets(blocks) {
  return blocks.map((b) => trimmedTarget(b.index, b.text, 0, b.text.length)).filter(Boolean);
}

export function selectionTargets(blocks, selection) {
  const targets = [];
  for (let i = selection.start.blockIndex; i <= selection.end.blockIndex; i++) {
    const block = blocks[i];
    if (!block) continue;
    const s0 = i === selection.start.blockIndex ? selection.start.offset : 0;
    const e0 = i === selection.end.blockIndex ? selection.end.offset : block.text.length;
    if (e0 <= s0 || !block.text.slice(s0, e0).trim()) continue;
    const spans = sentenceSpans(block.text);
    const first = spans.find((sp) => s0 < sp.end);
    const last = [...spans].reverse().find((sp) => e0 > sp.start);
    const target = first && last ? trimmedTarget(i, block.text, first.start, last.end) : null;
    if (target) targets.push(target);
  }
  return targets;
}

function splitLongTarget(target, maxWords) {
  if (countWords(target.text) <= maxWords) return [target];
  const parts = [];
  let current = null;
  for (const span of sentenceSpans(target.text)) {
    const words = countWords(span.text);
    if (current && current.words + words > maxWords) {
      parts.push(current);
      current = null;
    }
    current ??= { start: span.start, end: span.start, words: 0 };
    current.end = span.end;
    current.words += words;
  }
  if (current) parts.push(current);
  return parts
    .map((p) => trimmedTarget(target.blockIndex, target.text, p.start, p.end))
    .filter(Boolean)
    .map((p) => ({ ...p, start: target.start + p.start, end: target.start + p.end }));
}

// Each target costs marker tokens in the reply, so cap how many go per request
export const MAX_TARGETS_PER_BATCH = 60;

export function batchTargets(targets, maxWords = 1500, maxTargets = MAX_TARGETS_PER_BATCH) {
  const split = targets.flatMap((t) => splitLongTarget(t, maxWords));
  const batches = [];
  let current = [];
  let words = 0;
  split.forEach((t, i) => {
    const w = countWords(t.text);
    if (current.length && (words + w > maxWords || current.length >= maxTargets)) {
      batches.push(current);
      current = [];
      words = 0;
    }
    current.push({ ...t, id: `t${i + 1}` });
    words += w;
  });
  if (current.length) batches.push(current);
  return batches;
}

// ── Caret memory for inserting catches ──────────────────────────────────────
// Kept per editor root rather than in React state: the caret moves on every
// keystroke, and the editor remounts (a new root) for each chapter.
const caretByRoot = new WeakMap();

export function topLevelNode(root, node) {
  let current = node;
  while (current && current.parentNode !== root) current = current.parentNode;
  return current && current.parentNode === root ? current : null;
}

export function rememberCaret(root, node) {
  caretByRoot.set(root, node);
}

export function rememberedCaret(root) {
  return caretByRoot.get(root) || null;
}

// End of the block holding the caret node, or of the last block when the
// caret is unknown or its node has left the editor
export function blockEndPoint(root, caretNode) {
  const blocks = getBlocks(root);
  if (blocks.length === 0) return { node: root, offset: 0 };
  const block = (caretNode && blocks.find((b) => b.nodes.includes(caretNode))) || blocks[blocks.length - 1];
  const last = block.nodes[block.nodes.length - 1];
  if (block.nodes.length === 1 && isBlockElement(last)) return { node: last, offset: last.childNodes.length };
  return { node: root, offset: [...root.childNodes].indexOf(last) + 1 };
}

// Inserts text as new paragraph(s) after the caret's block. execCommand keeps
// it in the browser's undo history and fires `input`, so autosave sees it.
export function insertParagraphAfter(root, caretNode, text) {
  const doc = root.ownerDocument;
  const point = blockEndPoint(root, caretNode);
  root.focus();
  const range = doc.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const lines = text.split('\n');
  let inserted = false;
  if (root.textContent.trim() !== '' || root.querySelector('br')) inserted = doc.execCommand('insertParagraph');
  lines.forEach((line, i) => {
    if (i > 0) doc.execCommand('insertParagraph');
    if (line) inserted = doc.execCommand('insertText', false, line) || inserted;
  });
  return inserted;
}
