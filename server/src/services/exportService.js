import PDFDocument from 'pdfkit';
import nodepub from 'nodepub';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readJSON } from './fileService.js';

export async function exportWork(workId, format, options = {}) {
  const meta = readJSON(`works/${workId}/meta.json`);
  if (!meta) {
    throw Object.assign(new Error('Work not found'), { status: 404, code: 'NOT_FOUND' });
  }

  const chapterIndex = readJSON(`works/${workId}/chapters.json`) || [];
  const chapters = chapterIndex
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) => {
      const ch = readJSON(`works/${workId}/chapters/${entry.id}.json`);
      return {
        title: entry.title || ch?.title || 'Untitled',
        content: ch?.content || '',
      };
    });

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
      doc.fontSize(12).font('Helvetica').text(chapter.content || '', { lineGap: 4 });
    }

    doc.end();
  });
}

// ─── EPUB ────────────────────────────────────────────────────────────────────

async function buildEPUB(meta, chapters) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptorium-epub-'));
  const outFile = path.join(tmpDir, 'output');

  try {
    const epubMeta = {
      id: meta.id || 'scriptorium-work',
      title: meta.title || 'Untitled',
      author: 'Author',
      genre: meta.genre || 'Fiction',
      description: meta.logline || '',
      cover: null,
      publisher: 'Scriptorium',
      language: 'en',
      date: new Date().toISOString().split('T')[0],
      contents: 'Table of Contents',
      source: '',
      images: [],
    };

    const allChapters = chapters.length > 0 ? chapters : [{ title: 'Empty', content: '' }];

    const epub = nodepub.document(epubMeta, textToHTML(allChapters[0].title, allChapters[0].content));

    for (let i = 1; i < allChapters.length; i++) {
      epub.addSection(
        allChapters[i].title,
        textToHTML(allChapters[i].title, allChapters[i].content)
      );
    }

    await new Promise((resolve, reject) => {
      epub.writeEPUB(
        () => {}, // log fn
        outFile,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const epubPath = outFile + '.epub';
    const buffer = fs.readFileSync(epubPath);
    return buffer;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

async function buildDOCX(meta, chapters) {
  const children = [
    new Paragraph({
      text: meta.title || 'Untitled',
      heading: HeadingLevel.TITLE,
    }),
  ];

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

    const paragraphs = (chapter.content || '').split(/\n\n+/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed })],
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textToHTML(title, text) {
  const body = (text || '')
    .split(/\n\n+/)
    .map((p) => `<p>${p.trim().replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<h1>${title}</h1>${body || '<p></p>'}`;
}
