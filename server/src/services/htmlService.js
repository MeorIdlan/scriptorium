import sanitizeHtml from 'sanitize-html';

// Chapter HTML comes from a contentEditable driven by document.execCommand,
// which emits <b>/<i>/<u>, <font face size>, and text-align on block elements.
const OPTIONS = {
  allowedTags: ['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'font', 'h1', 'h2', 'h3', 'blockquote'],
  allowedAttributes: {
    '*': ['style', 'align'],
    font: ['face', 'size'],
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

export function sanitizeChapterHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, OPTIONS);
}
