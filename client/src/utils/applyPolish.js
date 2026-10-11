// Writes accepted Polish changes into the live editor DOM by text offset, so
// formatting outside each changed range is untouched.
import { getBlocks, blockPieces } from './editorBlocks.js';

const ELEMENT = 1;
const CLEANUP_TAGS = new Set(['B', 'I', 'U', 'EM', 'STRONG', 'SPAN', 'FONT']);

function insertNodes(doc, parent, before, text) {
  text.split('\n').forEach((line, i) => {
    if (i > 0) parent.insertBefore(doc.createElement('br'), before);
    if (line) parent.insertBefore(doc.createTextNode(line), before);
  });
}

// Inline elements between a node and its block: a rewrite should land in the
// least-formatted text node at the insertion point, not inherit the italics of
// a neighbouring word that happens to end there
function inlineDepth(block, node) {
  const container = block.nodes.length === 1 && block.nodes[0].nodeType === ELEMENT ? block.nodes[0] : block.nodes[0].parentNode;
  let depth = 0;
  for (let n = node.parentNode; n && n !== container; n = n.parentNode) depth += 1;
  return depth;
}

function insertAt(block, offset, text) {
  const doc = block.nodes[0].ownerDocument;
  const { pieces } = blockPieces(block.nodes);
  const touching = pieces.filter((p) => p.kind === 'text' && p.start <= offset && offset <= p.end);
  const textPiece = touching.reduce(
    (best, p) => (!best || inlineDepth(block, p.node) < inlineDepth(block, best.node) ? p : best),
    null
  );
  if (textPiece) {
    const node = textPiece.node;
    const at = offset - textPiece.start;
    const tail = node.data.slice(at);
    const lines = text.split('\n');
    node.data = node.data.slice(0, at) + lines[0];
    let last = node;
    for (const line of lines.slice(1)) {
      const br = doc.createElement('br');
      const next = doc.createTextNode(line);
      last.parentNode.insertBefore(br, last.nextSibling);
      br.parentNode.insertBefore(next, br.nextSibling);
      last = next;
    }
    last.data += tail;
    return;
  }

  const edge = pieces.find((p) => p.start === offset || p.end === offset);
  if (edge) {
    if (edge.kind === 'virtual' && edge.end === offset) {
      insertNodes(doc, edge.node, edge.node.firstChild, text);
    } else if (edge.kind === 'virtual-after') {
      if (edge.start === offset) insertNodes(doc, edge.node, null, text);
      else insertNodes(doc, edge.node.parentNode, edge.node.nextSibling, text);
    } else {
      const before = edge.start === offset ? edge.node : edge.node.nextSibling;
      insertNodes(doc, edge.node.parentNode, before, text);
    }
    return;
  }

  const first = block.nodes[0];
  if (first.nodeType === ELEMENT && block.nodes.length === 1) insertNodes(doc, first, null, text);
  else insertNodes(doc, first.parentNode, block.nodes[block.nodes.length - 1].nextSibling, text);
}

function replaceRange(block, start, end, toText) {
  const { pieces } = blockPieces(block.nodes);
  for (const p of pieces) {
    const s = Math.max(start, p.start);
    const e = Math.min(end, p.end);
    if (e <= s) continue;
    if (p.kind === 'text') p.node.data = p.node.data.slice(0, s - p.start) + p.node.data.slice(e - p.start);
    else if (p.kind === 'break') p.node.remove();
  }
  block.nodes = block.nodes.filter((n) => n.parentNode);
  if (toText) insertAt(block, start, toText);
}

function removeEmptyInlines(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType !== ELEMENT) continue;
    removeEmptyInlines(child);
    if (CLEANUP_TAGS.has(child.tagName) && child.textContent === '' && !child.querySelector('br')) child.remove();
  }
}

export function applyPolish(root, changes, originalBlockTexts) {
  const byBlock = new Map();
  for (const c of changes) {
    if (c.status !== 'accepted') continue;
    if (!byBlock.has(c.blockIndex)) byBlock.set(c.blockIndex, []);
    byBlock.get(c.blockIndex).push(c);
  }

  const blocks = getBlocks(root);
  let applied = 0;
  let skipped = 0;
  for (const [index, list] of byBlock) {
    const block = blocks[index];
    if (!block || block.text !== originalBlockTexts[index]) {
      skipped += list.length;
      continue;
    }
    // Last first, so earlier offsets stay valid
    list.sort((a, b) => b.start - a.start);
    for (const c of list) {
      replaceRange(block, c.start, c.end, c.toText);
      applied += 1;
    }
    for (const node of block.nodes) {
      if (node.nodeType === ELEMENT) removeEmptyInlines(node);
    }
    if (block.nodes.length > 1 || block.nodes[0]?.nodeType !== ELEMENT) removeEmptyInlines(root);
  }
  return { applied, skipped };
}
