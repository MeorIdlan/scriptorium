// Manuscript-format export: pure helpers (no DB, no I/O). The DOCX/PDF builders
// and the details service build on these.
import PDFDocument from 'pdfkit';
import { AlignmentType, Document, Header, Packer, PageNumber, Paragraph, Tab, TabStopType, TextRun } from 'docx';
import { docxTextRuns, pdfFont, runLines } from './exportRuns.js';

export const MANUSCRIPT_SCENE_BREAK = '#';

const MANUSCRIPT_FONTS = { serif: 'Times New Roman', mono: 'Courier New' };
// Lengths are twips (1/1440 in). Text width is US Letter less 1 in margins each side.
const TEXT_WIDTH = 9360;
const INDENT = 720;

// Under 10k words: nearest 100. From 10k: nearest 1,000. Never below 100.
export function roundWordCount(n) {
  const step = n < 10000 ? 100 : 1000;
  return Math.max(100, Math.round(n / step) * step);
}

export function formatWordCount(n) {
  return `about ${roundWordCount(n).toLocaleString('en-US')} words`;
}

export function defaultSurname(authorName) {
  const words = (authorName || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : '';
}

export function headerText({ surname, headerTitle }, page) {
  return `${surname} / ${headerTitle.toUpperCase()} / ${page}`;
}

// Resolution order (spec "Data → Resolving"): an override is used whole, with no
// per-field fallback to the writer's defaults; blank surname and blank author
// name fall back as described there.
export function resolveManuscriptDetails({ settings, work, userName }) {
  const override = work.manuscript?.override;
  const source = override || settings || {};
  const authorName = source.authorName || userName || '';
  return {
    authorName,
    surname: source.surname || defaultSurname(authorName),
    contactBlock: source.contactBlock || '',
    headerTitle: work.manuscript?.headerTitle || work.title,
    font: settings?.font || 'serif',
    workOnly: Boolean(override),
  };
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

// Standard manuscript layout: US Letter, 1 in margins, 12 pt double-spaced, running
// header from the second page on. `chapters` is [{ title, scenes }] with each paragraph
// as Run[] (exportScenes); chapter notes are never printed.
export async function buildManuscriptDOCX({ title, chapters, details, wordCount }) {
  const font = MANUSCRIPT_FONTS[details.font] || MANUSCRIPT_FONTS.serif;
  const children = manuscriptTitlePage(title, details, wordCount);
  for (const chapter of chapters) children.push(...manuscriptChapter(chapter));
  children.push(
    new Paragraph({}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('END')] })
  );

  const running = headerText({ surname: details.surname, headerTitle: details.headerTitle }, '');
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font, size: 24 }, paragraph: { spacing: { line: 480 } } },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720 },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({})] }),
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun(running), new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// The title starts halfway down the page (7920 twips). What is left after the top margin
// and the single-spaced lines above it is the space before. The first line always
// exists (it carries the word count), so an empty contact block still counts as one.
function titleSpaceBefore(contactBlock) {
  const contactLines = Math.max(1, contactBlock ? contactBlock.split('\n').length : 0);
  return Math.max(240, 7920 - 1440 - 240 * contactLines);
}

// Contact block top-left, single-spaced, with the word count on its first line;
// the capitalised title sits about halfway down.
function manuscriptTitlePage(title, details, wordCount) {
  const [first = '', ...rest] = details.contactBlock ? details.contactBlock.split('\n') : [];
  return [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
      spacing: { line: 240 },
      children: [new TextRun(first), new TextRun({ children: [new Tab(), formatWordCount(wordCount)] })],
    }),
    ...rest.map((line) => new Paragraph({ spacing: { line: 240 }, children: [new TextRun(line)] })),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: titleSpaceBefore(details.contactBlock) },
      children: [new TextRun(title.toUpperCase())],
    }),
    new Paragraph({}),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`by ${details.authorName}`)] }),
  ];
}

// A chapter opens on a new page, a third down. Its first paragraph and the first
// paragraph after a scene break have no first-line indent; the rest do.
function manuscriptChapter({ title, scenes }) {
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: { before: 3840 },
      children: [new TextRun(title)],
    }),
    new Paragraph({}),
  ];
  let canIndent = false;
  scenes.forEach((paragraphs, i) => {
    if (i > 0) {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(MANUSCRIPT_SCENE_BREAK)] }));
      canIndent = false;
    }
    for (const p of paragraphs) {
      out.push(new Paragraph({ children: docxTextRuns(p), indent: canIndent ? { firstLine: INDENT } : undefined }));
      canIndent = true;
    }
  });
  return out;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const MANUSCRIPT_PDF_FONTS = {
  serif: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', boldItalic: 'Times-BoldItalic' },
  mono: { regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique', boldItalic: 'Courier-BoldOblique' },
};
// Points. US Letter with 1 in margins: 468 pt of text width between them.
const PDF_MARGIN = 72;
const PDF_TEXT_WIDTH = 468;
const PDF_LINE = 24;
const PDF_INDENT = 36;
const PDF_CHAPTER_Y = 264; // a third down the page
const PDF_TITLE_Y = 396; // halfway down
const PDF_HEADER_Y = 36; // half an inch from the top edge
const PDF_COUNT_GAP = 12;

// Same layout as buildManuscriptDOCX. Standard fonts are not embedded, so characters
// outside WinAnsi may print wrong but never throw. `compress` is pdfkit's stream option.
export function buildManuscriptPDF({ title, chapters, details, wordCount }, { compress = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PDF_MARGIN, bufferPages: true, compress });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fonts = MANUSCRIPT_PDF_FONTS[details.font] || MANUSCRIPT_PDF_FONTS.serif;
    doc.font(fonts.regular).fontSize(12);
    // pdfkit adds lineGap to the font's own line height; this makes each line 24 pt.
    const lineGap = PDF_LINE - doc.currentLineHeight(true);

    manuscriptTitlePagePDF(doc, { title, details, wordCount }, lineGap);
    for (const chapter of chapters) manuscriptChapterPDF(doc, chapter, lineGap, fonts);
    blankLinePDF(doc, PDF_LINE);
    doc.text('END', PDF_MARGIN, undefined, { width: PDF_TEXT_WIDTH, align: 'center', lineGap });

    manuscriptHeadersPDF(doc, details);
    doc.end();
  });
}

// Contact block top-left, single-spaced, with the word count on its first line; the
// capitalised title sits halfway down, then a blank line, then the author.
function manuscriptTitlePagePDF(doc, { title, details, wordCount }, lineGap) {
  const count = formatWordCount(wordCount);
  const single = { width: PDF_TEXT_WIDTH, lineGap: 0 };
  doc.text(count, PDF_MARGIN, PDF_MARGIN, { ...single, align: 'right' });
  doc.y = PDF_MARGIN;
  // The first line wraps before the word count's space, as the DOCX tab stop does.
  const firstWidth = PDF_TEXT_WIDTH - doc.widthOfString(count) - PDF_COUNT_GAP;
  const lines = details.contactBlock ? details.contactBlock.split('\n') : [];
  lines.forEach((line, i) => {
    if (line === '') blankLinePDF(doc, doc.currentLineHeight(true));
    else doc.text(line, PDF_MARGIN, undefined, { ...single, width: i === 0 ? firstWidth : PDF_TEXT_WIDTH });
  });

  const centred = { width: PDF_TEXT_WIDTH, align: 'center', lineGap };
  doc.text(title.toUpperCase(), PDF_MARGIN, PDF_TITLE_Y, centred);
  blankLinePDF(doc, PDF_LINE);
  doc.text(`by ${details.authorName}`, PDF_MARGIN, undefined, centred);
}

// A chapter opens on a new page, a third down, then one blank line. Its first paragraph
// and the first paragraph after a scene break have no first-line indent; the rest do.
function manuscriptChapterPDF(doc, { title, scenes }, lineGap, fonts) {
  const centred = { width: PDF_TEXT_WIDTH, align: 'center', lineGap };
  doc.addPage();
  doc.text(title, PDF_MARGIN, PDF_CHAPTER_Y, centred);
  blankLinePDF(doc, PDF_LINE);

  let canIndent = false;
  scenes.forEach((paragraphs, i) => {
    if (i > 0) {
      doc.text(MANUSCRIPT_SCENE_BREAK, PDF_MARGIN, undefined, centred);
      canIndent = false;
    }
    for (const p of paragraphs) {
      paragraphPDF(doc, p, canIndent ? PDF_INDENT : 0, lineGap, fonts);
      canIndent = true;
    }
  });
}

// Each run continues its line, and a line break ends the line. Only the paragraph's first
// line takes the indent. An empty line keeps the blank-line step. The regular font is set
// again at the end, so the scene break, END and the running header are not styled.
function paragraphPDF(doc, runs, indent, lineGap, fonts) {
  runLines(runs).forEach((line, l) => {
    if (line.length === 0) {
      blankLinePDF(doc, PDF_LINE);
      return;
    }
    line.forEach((run, r) => {
      // An explicit x on a continued chain breaks it from the third run on (pdfkit 0.15),
      // so the margin is set on the document and the text takes no x or y.
      if (r === 0) doc.x = PDF_MARGIN;
      doc.font(pdfFont(fonts, run)).text(run.text, {
        width: PDF_TEXT_WIDTH,
        indent: r === 0 && l === 0 ? indent : 0,
        continued: r < line.length - 1,
        underline: run.underline,
        lineGap,
      });
    });
  });
  doc.font(fonts.regular);
}

// pdfkit does not advance y for empty text, so a blank line moves the cursor itself. A
// blank line that runs past the bottom margin starts a new page at the next line of text.
function blankLinePDF(doc, step) {
  doc.y += step;
}

// Running header on every page after the title page, drawn last so the page count is
// known. It is always one line, right-aligned to the margin: a title too wide for the
// text width is cut with an ellipsis, so the surname and page number stay whole.
function manuscriptHeadersPDF(doc, details) {
  const { count } = doc.bufferedPageRange();
  for (let i = 1; i < count; i++) {
    doc.switchToPage(i);
    let title = details.headerTitle;
    let text = headerText({ surname: details.surname, headerTitle: title }, i + 1);
    while (doc.widthOfString(text) > PDF_TEXT_WIDTH && title.length > 0) {
      title = title.slice(0, -1);
      text = headerText({ surname: details.surname, headerTitle: `${title.trimEnd()}…` }, i + 1);
    }
    const x = PDF_MARGIN + PDF_TEXT_WIDTH - doc.widthOfString(text);
    doc.text(text, x, PDF_HEADER_Y, { lineBreak: false, lineGap: 0 });
  }
}
