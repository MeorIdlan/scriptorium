// Manuscript-format export: pure helpers (no DB, no I/O). The DOCX/PDF builders
// and the details service build on these.
import { AlignmentType, Document, Header, Packer, PageNumber, Paragraph, Tab, TabStopType, TextRun } from 'docx';

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
// header from the second page on. `chapters` is [{ title, scenes }] as exportScenes
// builds it; chapter notes are never printed.
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
      spacing: { before: 4320 },
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
      out.push(new Paragraph({ children: lineRuns(p), indent: canIndent ? { firstLine: INDENT } : undefined }));
      canIndent = true;
    }
  });
  return out;
}

// A paragraph may hold line breaks (<br> in the editor)
function lineRuns(text) {
  return text.split('\n').map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 }));
}
