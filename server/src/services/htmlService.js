import sanitizeHtml from 'sanitize-html';
import { SCENE_ATTRS, SCENE_LIMITS, SCENE_STATUSES, newSceneId } from './sceneMarkers.js';
import { parseThreadIds } from './threadTags.js';

// Chapter HTML comes from a contentEditable driven by document.execCommand,
// which emits <b>/<i>/<u>, <font face size>, and text-align on block elements.
// <hr data-scene …> marks the start of a scene; its attributes are the card.
const OPTIONS = {
  allowedTags: ['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'font', 'h1', 'h2', 'h3', 'blockquote', 'hr'],
  allowedAttributes: {
    '*': ['style', 'align'],
    font: ['face', 'size'],
    hr: ['data-scene', ...Object.values(SCENE_ATTRS), 'data-threads', 'data-status'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify|start|end)$/],
      'font-family': [/^[\w\s,'"-]+$/],
      'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/, /^(x{0,2}-small|small|medium|large|x{0,3}-large)$/],
      'font-weight': [/^(bold|normal|\d{3})$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|none)$/],
    },
  },
  allowedSchemes: [],
};

const SAFE_ID = /^[\w-]{1,64}$/;

// Ids only need to be unique within one chapter, so each call tracks its own
function sceneMarker() {
  const seen = new Set();
  return (tagName, attribs) => {
    let id = typeof attribs['data-scene'] === 'string' ? attribs['data-scene'].trim() : '';
    if (!SAFE_ID.test(id) || seen.has(id)) id = newSceneId();
    seen.add(id);
    const out = { 'data-scene': id };
    for (const [field, attr] of Object.entries(SCENE_ATTRS)) {
      const value = typeof attribs[attr] === 'string' ? attribs[attr].trim().slice(0, SCENE_LIMITS[field]).trim() : '';
      if (value) out[attr] = value;
    }
    const threads = parseThreadIds(attribs['data-threads']);
    if (threads.length) out['data-threads'] = threads.join(' ');
    out['data-status'] = SCENE_STATUSES.includes(attribs['data-status']) ? attribs['data-status'] : 'draft';
    return { tagName: 'hr', attribs: out };
  };
}

export function sanitizeChapterHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, { ...OPTIONS, transformTags: { hr: sceneMarker() } });
}
