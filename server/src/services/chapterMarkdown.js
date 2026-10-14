import { parseDocument } from 'htmlparser2';
import { SCENE_BREAK } from './exportService.js';

// Escape only what would turn writer text into Markdown
function escapeText(text) {
  return text
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .replace(/^(\s*)([#+-])/gm, '$1\\$2')
    .replace(/^(\s*\d+)\./gm, '$1\\.');
}

// A line break at the end of a block or mark has nothing to write, nor do spaces after it
const TRAILING_BREAKS = /(\\\n\s*)+$/;

// Keep the spaces outside the marks, or the emphasis won't render
function emphasis(mark, text) {
  const clean = text.replace(TRAILING_BREAKS, '');
  const [, lead, body, trail] = clean.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return body ? `${lead}${mark}${body}${mark}${trail}` : clean;
}

function inline(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeText(node.data);
      if (node.type !== 'tag') return '';
      if (node.name === 'br') return '\\\n';
      if (node.name === 'b' || node.name === 'strong') return emphasis('**', inline(node.children));
      if (node.name === 'i' || node.name === 'em') return emphasis('*', inline(node.children));
      return inline(node.children || []);
    })
    .join('');
}

// A paragraph holding only line breaks (an empty editor line) has nothing to write
function paragraph(text) {
  const trimmed = text.replace(TRAILING_BREAKS, '').trim();
  return trimmed.replace(/\\\n/g, '').trim() ? [trimmed] : [];
}

function quote(parts) {
  return parts
    .join('\n\n')
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function blocks(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === 'text') {
      const text = escapeText(node.data.trim());
      return text ? [text] : [];
    }
    if (node.type !== 'tag') return [];
    if (node.name === 'hr') return [SCENE_BREAK];
    if (/^h[1-3]$/.test(node.name)) {
      const text = inline(node.children).replace(TRAILING_BREAKS, '').trim();
      return text ? [`${'#'.repeat(Number(node.name[1]))} ${text}`] : [];
    }
    if (node.name === 'blockquote') return [quote(blocks(node.children))];
    if (node.name === 'p' || node.name === 'div') return paragraph(inline(node.children));
    return blocks(node.children || []);
  });
}

export function chapterMarkdown(html) {
  const body = blocks(parseDocument(html || '').children).join('\n\n');
  return body ? `${body}\n` : '';
}
