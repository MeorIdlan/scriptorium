// Scenes live inside a chapter's HTML: each starts with a top-level
// <hr data-scene …> whose attributes hold the scene's card.
import { parseDocument } from 'htmlparser2';
import { randomBytes } from 'node:crypto';
import { countWords } from './wordCountService.js';
import { parseThreadIds } from './threadTags.js';

export const SCENE_STATUSES = ['todo', 'draft', 'revise', 'done'];
export const SCENE_LIMITS = { title: 120, pov: 60, location: 80, summary: 600 };
export const SCENE_ATTRS = { title: 'data-title', pov: 'data-pov', location: 'data-location', summary: 'data-summary' };

const BLOCK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'blockquote']);

export function newSceneId(now = Date.now()) {
  return `scn_${now}_${randomBytes(3).toString('hex')}`;
}

const isTag = (node) => node.type === 'tag';
export const isMarker = (node) => isTag(node) && node.name === 'hr' && Boolean(node.attribs['data-scene']);

// Same model as the client's blockPieces: a nested block or <hr> ends a line
function blockText(nodes) {
  let text = '';
  let closed = false;
  const breakAfter = () => {
    if (closed && text && !text.endsWith('\n')) text += '\n';
    closed = false;
  };
  const walk = (node, nested) => {
    if (node.type === 'text') {
      if (node.data) breakAfter();
      text += node.data;
      return;
    }
    if (!isTag(node)) return;
    if (node.name === 'br') {
      breakAfter();
      text += '\n';
      return;
    }
    if (node.name === 'hr') {
      closed = true;
      return;
    }
    const block = BLOCK_TAGS.has(node.name);
    if (block) {
      closed = false;
      if (text && !text.endsWith('\n')) text += '\n';
    }
    for (const child of node.children) walk(child, true);
    if (nested && block) closed = true;
  };
  for (const node of nodes) walk(node, false);
  return text;
}

// Top-level blocks: each block element (or <hr>) alone, runs of inline nodes together
export function topBlocks(nodes, render = blockText) {
  const groups = [];
  let run = null;
  for (const node of nodes) {
    if (isTag(node) && (BLOCK_TAGS.has(node.name) || node.name === 'hr')) {
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
  return groups.map((group) => render(group));
}

// [{ marker, nodes }]; the first entry is the opening (marker null)
export function splitTop(html) {
  const doc = parseDocument(html || '', { withStartIndices: true, withEndIndices: true });
  const segments = [{ marker: null, nodes: [] }];
  for (const node of doc.children) {
    if (isMarker(node)) segments.push({ marker: node, nodes: [] });
    else segments[segments.length - 1].nodes.push(node);
  }
  return segments;
}

export function cardOf(marker) {
  if (!marker) return { id: null, title: '', pov: '', location: '', status: 'draft', summary: '', threadIds: [] };
  const a = marker.attribs;
  const card = { id: a['data-scene'] };
  for (const [field, attr] of Object.entries(SCENE_ATTRS)) card[field] = a[attr] || '';
  card.status = SCENE_STATUSES.includes(a['data-status']) ? a['data-status'] : 'draft';
  card.threadIds = parseThreadIds(a['data-threads']);
  return card;
}

export function paragraphsOf(nodes) {
  return topBlocks(nodes)
    .flatMap((block) => block.split(/\n\s*\n/))
    .map((p) => p.trim())
    .filter(Boolean);
}

const PLAIN_STYLE = { bold: false, italic: false, underline: false };
const BOLD_WEIGHT = /^(bold|bolder|[6-9]00)$/;
const PLAIN_WEIGHT = /^(normal|400)$/;
const sameStyle = (a, b) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;

// The style an element gives its children: its tag, then its inline style
function styleOf(node, inherited) {
  const style = { ...inherited };
  if (node.name === 'b' || node.name === 'strong') style.bold = true;
  if (node.name === 'i' || node.name === 'em') style.italic = true;
  if (node.name === 'u') style.underline = true;
  for (const declaration of (node.attribs.style || '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim().toLowerCase();
    if (prop === 'font-weight') {
      if (BOLD_WEIGHT.test(value)) style.bold = true;
      else if (PLAIN_WEIGHT.test(value)) style.bold = false;
    } else if (prop === 'font-style') {
      if (value === 'italic') style.italic = true;
      else if (value === 'normal') style.italic = false;
    } else if (prop === 'text-decoration' && value.includes('underline')) {
      style.underline = true;
    }
  }
  return style;
}

// blockText with each piece of text kept under its style: { text, runs }, where
// text is exactly what blockText returns and the runs spell it out
function styledBlockText(nodes) {
  let text = '';
  const runs = [];
  let closed = false;
  const append = (piece, style) => {
    if (!piece) return;
    text += piece;
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, style)) last.text += piece;
    else runs.push({ text: piece, ...style });
  };
  const breakAfter = (style) => {
    if (closed && text && !text.endsWith('\n')) append('\n', style);
    closed = false;
  };
  const walk = (node, nested, inherited) => {
    if (node.type === 'text') {
      if (node.data) breakAfter(inherited);
      append(node.data, inherited);
      return;
    }
    if (!isTag(node)) return;
    if (node.name === 'br') {
      breakAfter(inherited);
      append('\n', inherited);
      return;
    }
    if (node.name === 'hr') {
      closed = true;
      return;
    }
    const style = styleOf(node, inherited);
    const block = BLOCK_TAGS.has(node.name);
    if (block) {
      closed = false;
      if (text && !text.endsWith('\n')) append('\n', inherited);
    }
    for (const child of node.children) walk(child, true, style);
    if (nested && block) closed = true;
  };
  for (const node of nodes) walk(node, false, PLAIN_STYLE);
  return { text, runs };
}

// The runs of text[start, end), keeping each run's style
function sliceRuns(runs, start, end) {
  const sliced = [];
  let offset = 0;
  for (const run of runs) {
    const from = Math.max(start - offset, 0);
    const to = Math.min(end - offset, run.text.length);
    if (to > from) sliced.push({ ...run, text: run.text.slice(from, to) });
    offset += run.text.length;
  }
  return sliced;
}

// paragraphsOf for styled blocks: the same cuts and trimming, as Run[] per paragraph
function styledParagraphsOf({ text, runs }) {
  const bounds = [];
  let from = 0;
  for (const match of text.matchAll(/\n\s*\n/g)) {
    bounds.push([from, match.index]);
    from = match.index + match[0].length;
  }
  bounds.push([from, text.length]);
  return bounds
    .map(([a, b]) => {
      const piece = text.slice(a, b);
      const start = a + piece.length - piece.trimStart().length;
      return [start, start + piece.trim().length];
    })
    .filter(([start, end]) => end > start)
    .map(([start, end]) => sliceRuns(runs, start, end));
}

export function parseScenes(html) {
  const segments = splitTop(html);
  const hasMarkers = segments.length > 1;
  return segments
    .map((seg) => {
      const paragraphs = paragraphsOf(seg.nodes);
      const text = paragraphs.join('\n');
      return { ...cardOf(seg.marker), paragraphs, text, wordCount: countWords(text) };
    })
    .filter((scene, i) => i > 0 || !hasMarkers || scene.text !== '');
}

export function sceneSummaries(html) {
  const scenes = parseScenes(html);
  if (!scenes.some((s) => s.id)) return [];
  return scenes.map(({ id, title, pov, location, status, summary, wordCount, threadIds }) => ({
    id,
    title,
    pov,
    location,
    status,
    summary,
    wordCount,
    threadIds,
  }));
}

export function chapterText(html) {
  return parseScenes(html)
    .map((s) => s.text)
    .filter(Boolean)
    .join('\n\n');
}

// Styled paragraphs (Run[]) per scene for export; older chapters only have plain text
export function exportScenes({ content, contentHtml }) {
  if (typeof contentHtml === 'string' && contentHtml.trim()) {
    return splitTop(contentHtml)
      .map((seg) => topBlocks(seg.nodes, styledBlockText).flatMap(styledParagraphsOf))
      .filter((p) => p.length > 0);
  }
  const paragraphs = (content || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.length ? [paragraphs.map((p) => [{ text: p, ...PLAIN_STYLE }])] : [];
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Chapters saved before HTML storage only have plain text; the editor loads
// that text with innerText, which turns newlines into <br>
export function chapterHtml({ content, contentHtml } = {}) {
  if (typeof contentHtml === 'string' && contentHtml.trim()) return contentHtml;
  if (!content) return '';
  return content.split('\n').map(escapeHtml).join('<br />');
}

function sliceOf(html, nodes) {
  if (nodes.length === 0) return '';
  return html.slice(nodes[0].startIndex, nodes[nodes.length - 1].endIndex + 1);
}

// { prefix, scenes: [{ id, marker, body }] } — an opening without text is
// kept as a prefix, not a scene (so an empty chapter has no scenes)
function sceneSegments(html) {
  const segments = splitTop(html).map((seg) => ({
    id: seg.marker ? seg.marker.attribs['data-scene'] : null,
    marker: seg.marker ? sliceOf(html, [seg.marker]) : '',
    body: sliceOf(html, seg.nodes),
    hasText: paragraphsOf(seg.nodes).length > 0,
  }));
  if (!segments[0].hasText) return { prefix: segments[0].body, scenes: segments.slice(1) };
  return { prefix: '', scenes: segments };
}

// A card-less scene anywhere but first would merge into the scene before it
function keepSeparate(scenes) {
  scenes.forEach((scene, i) => {
    if (i > 0 && !scene.marker) {
      scene.id = newSceneId();
      scene.marker = `<hr data-scene="${scene.id}" data-status="draft" />`;
    }
  });
}

const joinSegments = ({ prefix, scenes }) => prefix + scenes.map((s) => s.marker + s.body).join('');

export function moveScene({ srcHtml, dstHtml, sceneId, toIndex, sameChapter }) {
  const src = sceneSegments(srcHtml || '');
  const from = src.scenes.findIndex((s) => (sceneId === 'opening' ? s.id === null : s.id === sceneId));
  if (from < 0) return { error: 'NOT_FOUND' };
  const dst = sameChapter ? src : sceneSegments(dstHtml || '');
  const [moved] = src.scenes.splice(from, 1);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > dst.scenes.length) return { error: 'INVALID_INDEX' };
  if (sameChapter && toIndex === from) return { error: 'NO_CHANGE' };
  dst.scenes.splice(toIndex, 0, moved);
  keepSeparate(src.scenes);
  if (!sameChapter) keepSeparate(dst.scenes);
  const newSrc = joinSegments(src);
  return { srcHtml: newSrc, dstHtml: sameChapter ? newSrc : joinSegments(dst) };
}
