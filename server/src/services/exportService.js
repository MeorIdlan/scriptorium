import PDFDocument from 'pdfkit';
import nodepub from 'nodepub';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';
import MapModel from '../models/Map.js';
import User from '../models/User.js';
import { exportScenes } from './sceneMarkers.js';
import { runLines, escapeXml, runsHTML, docxTextRuns, pdfFont } from './exportRuns.js';
import { buildManuscriptDOCX, buildManuscriptPDF } from './manuscriptExport.js';

export async function exportWork(workId, format, options = {}) {
  const { includeNotes = false, includeOutline = false, layout = 'reading', manuscript } = options;
  const work = await Work.findById(workId);
  if (!work) {
    throw Object.assign(new Error('Work not found'), { status: 404, code: 'NOT_FOUND' });
  }
  const owner = await User.findById(work.ownerId).select('name').lean();
  const meta = { ...work.toJSON(), author: owner?.name || '' };

  const [chapterDocs, map] = await Promise.all([
    Chapter.find({ workId }).sort({ order: 1 }).lean(),
    MapModel.findOne({ workId }).lean(),
  ]);
  // Outline chapters: still marked outline with no prose written
  const exported = chapterDocs.filter((ch) => includeOutline || !(ch.status === 'outline' && !ch.wordCount));
  if (layout === 'manuscript') return exportManuscript(meta, exported, format, manuscript);

  const chapters = exported.map((ch) => ({
    title: ch.title || 'Untitled',
    scenes: exportScenes(ch),
    // The Map's notes field is the one the UI edits
    notes: includeNotes ? (map?.chapters?.[ch._id]?.notes || ch.notes || '').trim() : '',
  }));

  switch (format) {
    case 'pdf':
      return buildPDF(meta, chapters);
    case 'epub':
      return buildEPUB(meta, chapters);
    case 'docx':
      return buildDOCX(meta, chapters);
    default:
      throw Object.assign(new Error(`Unsupported format: ${format}`), {
        status: 400,
        code: 'UNSUPPORTED_FORMAT',
      });
  }
}

// Manuscript layout: chapter notes are never printed, so they are not passed on
function exportManuscript(meta, chapterDocs, format, details) {
  const input = {
    title: meta.title || 'Untitled',
    chapters: chapterDocs.map((ch) => ({ title: ch.title || 'Untitled', scenes: exportScenes(ch) })),
    details,
    wordCount: chapterDocs.reduce((sum, ch) => sum + (ch.wordCount || 0), 0),
  };

  switch (format) {
    case 'pdf':
      return buildManuscriptPDF(input);
    case 'docx':
      return buildManuscriptDOCX(input);
    default:
      throw Object.assign(new Error(`The manuscript layout is not available for ${format}`), {
        status: 400,
        code: 'UNSUPPORTED_LAYOUT',
      });
  }
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const READING_FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
};

function buildPDF(meta, chapters) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Title page
    doc.fontSize(28).font('Helvetica-Bold').text(meta.title || 'Untitled', { align: 'center' });
    doc.moveDown();
    if (meta.author) {
      doc.fontSize(14).font('Helvetica').text(meta.author, { align: 'center' });
      doc.moveDown();
    }
    if (meta.genre) {
      doc.fontSize(14).font('Helvetica').text(meta.genre, { align: 'center' });
    }
    if (meta.logline) {
      doc.moveDown();
      doc.fontSize(11).font('Helvetica-Oblique').text(meta.logline, { align: 'center' });
    }
    doc.moveDown(2);

    for (const chapter of chapters) {
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text(chapter.title);
      doc.moveDown();
      if (chapter.notes) {
        doc.fontSize(10).font('Helvetica-Oblique').text(`Notes: ${chapter.notes}`, { lineGap: 2 });
        doc.moveDown();
      }
      doc.fontSize(12).font('Helvetica');
      chapter.scenes.forEach((paragraphs, i) => {
        if (i > 0) {
          doc.moveDown(0.5);
          doc.text(SCENE_BREAK, { align: 'center' });
          doc.moveDown(0.5);
        }
        for (const p of paragraphs) writePDFParagraph(doc, p);
      });
    }

    doc.end();
  });
}

// Each run continues its line; a line break ends the line. pdfkit never gets a line
// break or an empty string, and the paragraph gap comes after the last line. A blank
// line still takes a line of height. The regular font is set again at the end, so
// text written after the paragraph (the scene break) is not styled
function writePDFParagraph(doc, runs) {
  const lines = runLines(runs);
  lines.forEach((line, l) => {
    const endOfParagraph = l === lines.length - 1;
    if (line.length === 0) {
      doc.font(READING_FONTS.regular).text(' ', { lineGap: 4, paragraphGap: endOfParagraph ? 8 : 0 });
      return;
    }
    line.forEach((run, r) => {
      const endOfLine = r === line.length - 1;
      doc.font(pdfFont(READING_FONTS, run)).text(run.text, {
        continued: !endOfLine,
        underline: run.underline,
        lineGap: 4,
        paragraphGap: endOfLine && endOfParagraph ? 8 : 0,
      });
    });
  });
  doc.font(READING_FONTS.regular);
}

// ─── EPUB ────────────────────────────────────────────────────────────────────

// nodepub's document() stores its state on a shared module-level object
// (`const self = this` in an arrow function), so builds must not overlap
let epubQueue = Promise.resolve();

function buildEPUB(meta, chapters) {
  const run = epubQueue.then(() => buildEPUBNow(meta, chapters));
  epubQueue = run.catch(() => {});
  return run;
}

async function buildEPUBNow(meta, chapters) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptorium-epub-'));

  try {
    // nodepub requires a cover image file
    const coverPath = path.join(tmpDir, 'cover.svg');
    fs.writeFileSync(coverPath, coverSVG(meta));

    const epubMeta = {
      id: meta.id || 'scriptorium-work',
      // nodepub templates these into XML without escaping
      title: escapeXml(meta.title || 'Untitled'),
      author: escapeXml(meta.author || 'Unknown'),
      fileAs: escapeXml(meta.author || 'Unknown'),
      copyright: '',
      tags: '',
      genre: escapeXml(meta.genre || 'Fiction'),
      description: escapeXml(meta.logline || ''),
      cover: coverPath,
      publisher: 'Scriptorium',
      language: 'en',
      published: new Date().toISOString().split('T')[0],
      contents: 'Table of Contents',
      source: '',
      images: [],
    };

    const allChapters = chapters.length > 0 ? chapters : [{ title: 'Empty', scenes: [], notes: '' }];

    const epub = nodepub.document(epubMeta);
    for (const chapter of allChapters) {
      epub.addSection(escapeXml(chapter.title), chapterToHTML(chapter));
    }

    await epub.writeEPUB(tmpDir, 'output');
    return fs.readFileSync(path.join(tmpDir, 'output.epub'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function coverSVG(meta) {
  const bg = /^#[0-9a-f]{6}$/i.test(meta.coverColor || '') ? meta.coverColor : '#2d3b4a';
  const title = wrapCoverText(meta.title || 'Untitled', 120, 60, 5);
  const titleLast = title.y + (title.lines.length - 1) * title.lineHeight;
  const author = wrapCoverText((meta.author || '').trim(), 64, 40, 3);
  const authorBlock = author.lines.length
    ? coverTextBlock({ ...author, y: round1(titleLast + 160), fill: '#c9a96e' })
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <rect width="1600" height="2560" fill="${bg}"/>
  ${coverTextBlock({ ...title, fill: '#e8e3d8' })}
  ${authorBlock}
</svg>
`;
}

// Cover text width estimate: usable width 1300 px, average glyph 0.55 em. Lengths count code
// points, so an emoji is one character and a hard break never splits a surrogate pair.
const COVER_TEXT_WIDTH = 1300;
const COVER_GLYPH_EM = 0.55;
const coverChars = (text) => Array.from(text).length;
const round1 = (n) => Math.round(n * 10) / 10;

// Greedy word wrap. Steps the font size down 10 % (never below `min`) until the lines fit in
// `maxLines`, then hard-breaks any word still too long at the minimum size. `y` is the first
// baseline, which centres the block's lines on y=1100.
function wrapCoverText(text, start, min, maxLines) {
  let size = start;
  let lines = wrapCoverLines(text, size, false);
  while (size > min && !coverLinesFit(lines, size, maxLines)) {
    size = Math.max(min, Math.round(size * 0.9));
    lines = wrapCoverLines(text, size, size === min);
  }
  const lineHeight = round1(size * 1.2);
  const y = round1(1100 - ((lines.length - 1) * lineHeight) / 2);
  return { lines, size, lineHeight, y };
}

function wrapCoverLines(text, size, hardBreak) {
  const maxChars = Math.floor(COVER_TEXT_WIDTH / (COVER_GLYPH_EM * size));
  const words = text.trim().split(/\s+/).flatMap((word) => {
    if (!hardBreak) return [word];
    const chars = Array.from(word);
    const chunks = [];
    for (let i = 0; i < chars.length; i += maxChars) chunks.push(chars.slice(i, i + maxChars).join(''));
    return chunks;
  });
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && coverChars(next) * COVER_GLYPH_EM * size > COVER_TEXT_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function coverLinesFit(lines, size, maxLines) {
  return lines.length <= maxLines && lines.every((line) => coverChars(line) * COVER_GLYPH_EM * size <= COVER_TEXT_WIDTH);
}

function coverTextBlock({ lines, size, lineHeight, y, fill }) {
  const tspans = lines.map((line, i) => `<tspan x="800" dy="${i ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join('');
  return `<text x="800" y="${y}" font-family="Georgia, serif" font-size="${size}" fill="${fill}" text-anchor="middle">${tspans}</text>`;
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

async function buildDOCX(meta, chapters) {
  const children = [
    new Paragraph({
      text: meta.title || 'Untitled',
      heading: HeadingLevel.TITLE,
    }),
  ];

  if (meta.author) {
    children.push(new Paragraph({ children: [new TextRun({ text: meta.author })] }));
  }

  if (meta.genre) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: meta.genre, italics: true })],
      })
    );
  }

  for (const chapter of chapters) {
    children.push(
      new Paragraph({
        text: chapter.title,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      })
    );

    if (chapter.notes) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Notes: ${chapter.notes}`, italics: true })],
          spacing: { after: 200 },
        })
      );
    }

    children.push(...docxBody(chapter.scenes));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const SCENE_BREAK = '* * *';

export function docxBody(scenes) {
  const out = [];
  scenes.forEach((paragraphs, i) => {
    if (i > 0) {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: SCENE_BREAK })], spacing: { after: 200 } }));
    }
    for (const p of paragraphs) out.push(new Paragraph({ children: docxTextRuns(p), spacing: { after: 200 } }));
  });
  return out;
}

export function chapterToHTML({ title, scenes, notes }) {
  const body = (scenes || [])
    .map((paragraphs) => paragraphs.map((p) => `<p>${runsHTML(p)}</p>`).join(''))
    .join(`<p style="text-align:center">${SCENE_BREAK}</p>`);
  const notesHtml = notes ? `<p><em>Notes: ${escapeXml(notes)}</em></p>` : '';
  return `<h1>${escapeXml(title)}</h1>${notesHtml}${body || '<p></p>'}`;
}
