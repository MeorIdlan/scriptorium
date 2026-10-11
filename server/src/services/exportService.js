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

export async function exportWork(workId, format, options = {}) {
  const { includeNotes = false, includeOutline = false } = options;
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
  const chapters = chapterDocs
    // Outline chapters: still marked outline with no prose written
    .filter((ch) => includeOutline || !(ch.status === 'outline' && !ch.wordCount))
    .map((ch) => ({
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

// ─── PDF ─────────────────────────────────────────────────────────────────────

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
        for (const p of paragraphs) doc.text(p, { lineGap: 4, paragraphGap: 8 });
      });
    }

    doc.end();
  });
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

function coverSVG(meta) {
  const bg = /^#[0-9a-f]{6}$/i.test(meta.coverColor || '') ? meta.coverColor : '#2d3b4a';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <rect width="1600" height="2560" fill="${bg}"/>
  <text x="800" y="1100" font-family="Georgia, serif" font-size="120" fill="#e8e3d8" text-anchor="middle">${escapeXml(meta.title || 'Untitled')}</text>
  <text x="800" y="1300" font-family="Georgia, serif" font-size="64" fill="#c9a96e" text-anchor="middle">${escapeXml(meta.author || '')}</text>
</svg>
`;
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

// A paragraph may hold line breaks (<br> in the editor)
function docxRuns(text) {
  return text.split('\n').map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 }));
}

export function docxBody(scenes) {
  const out = [];
  scenes.forEach((paragraphs, i) => {
    if (i > 0) {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: SCENE_BREAK })], spacing: { after: 200 } }));
    }
    for (const p of paragraphs) out.push(new Paragraph({ children: docxRuns(p), spacing: { after: 200 } }));
  });
  return out;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function chapterToHTML({ title, scenes, notes }) {
  const body = (scenes || [])
    .map((paragraphs) => paragraphs.map((p) => `<p>${escapeXml(p).replace(/\n/g, '<br/>')}</p>`).join(''))
    .join(`<p style="text-align:center">${SCENE_BREAK}</p>`);
  const notesHtml = notes ? `<p><em>Notes: ${escapeXml(notes)}</em></p>` : '';
  return `<h1>${escapeXml(title)}</h1>${notesHtml}${body || '<p></p>'}`;
}
