import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManuscriptDOCX } from '../src/services/manuscriptExport.js';
import { unzip } from './support/zip.js';

const plain = (text) => ({ text, bold: false, italic: false, underline: false });

const BASE = {
  title: 'The Glass Orchard',
  details: {
    authorName: 'J. Q. Ward',
    surname: 'Ward',
    contactBlock: 'Jane Writer\n12 Some Street\njane@example.com',
    headerTitle: 'Glass Orchard',
    font: 'serif',
  },
  wordCount: 87420,
  chapters: [
    { title: 'One', scenes: [[[plain('A1')], [plain('A2 line\nbreak')]], [[plain('B1')]]] },
    { title: 'Two', scenes: [[[plain('C1')]]] },
  ],
};

async function build(overrides = {}) {
  return unzip(await buildManuscriptDOCX({ ...BASE, ...overrides }));
}

const text = (files, name) => files.get(name).toString('utf8');

// Every <w:p> element in document order, empty ones included.
function paragraphs(xml) {
  return xml.match(/<w:p(?:\/>|[ >][\s\S]*?<\/w:p>)/g) ?? [];
}

// Concatenated text of one paragraph (w:tab and w:br carry no text).
function textOf(p) {
  return [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

function paragraphStarting(xml, prefix) {
  const p = paragraphs(xml).find((x) => textOf(x).startsWith(prefix));
  assert.ok(p, `no paragraph starting with "${prefix}"`);
  return p;
}

// The header part a sectPr references for a given type ('default' or 'first').
function headerXml(files, type) {
  const doc = text(files, 'word/document.xml');
  const rid = doc.match(new RegExp(`<w:headerReference w:type="${type}" r:id="([^"]+)"`))?.[1];
  assert.ok(rid, `no ${type} headerReference`);
  const rels = text(files, 'word/_rels/document.xml.rels');
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
  return text(files, `word/${rel.match(/Target="([^"]+)"/)[1]}`);
}

test('font, size and double spacing come from the document default style', async () => {
  const styles = text(await build(), 'word/styles.xml');
  assert.match(styles, /w:ascii="Times New Roman"/);
  assert.match(styles, /<w:sz w:val="24"\/>/);
  assert.match(styles, /w:line="480"/);
});

test('mono font maps to Courier New', async () => {
  const files = await build({ details: { ...BASE.details, font: 'mono' } });
  assert.match(text(files, 'word/styles.xml'), /w:ascii="Courier New"/);
});

test('US Letter page with 1 inch margins and a 0.5 inch header distance', async () => {
  const doc = text(await build(), 'word/document.xml');
  assert.match(doc, /<w:pgSz w:w="12240" w:h="15840"/);
  const pgMar = doc.match(/<w:pgMar[^>]*\/>/)[0];
  for (const side of ['top', 'right', 'bottom', 'left']) assert.match(pgMar, new RegExp(`w:${side}="1440"`));
  assert.match(pgMar, /w:header="720"/);
});

test('body paragraphs get a first-line indent except a chapter opener and the first paragraph after a break', async () => {
  const doc = text(await build(), 'word/document.xml');
  assert.doesNotMatch(paragraphStarting(doc, 'A1'), /w:firstLine/);
  assert.doesNotMatch(paragraphStarting(doc, 'B1'), /w:firstLine/);
  assert.doesNotMatch(paragraphStarting(doc, 'C1'), /w:firstLine/);
  assert.match(paragraphStarting(doc, 'A2'), /w:firstLine="720"/);
});

test('a paragraph with line breaks keeps the breaks and one first-line indent', async () => {
  const a2 = paragraphStarting(text(await build(), 'word/document.xml'), 'A2');
  assert.match(a2, /<w:br\/>/);
  assert.match(a2, /w:firstLine="720"/);
});

// The XML of the <w:r> run whose text is `text`
function runXml(xml, text) {
  return (xml.match(/<w:r>.*?<\/w:r>/g) ?? []).find((run) => run.includes(`>${text}</w:t>`));
}

test('manuscript DOCX runs carry bold, italics and underline', async () => {
  const chapters = [
    {
      title: 'Four',
      scenes: [[[
        { ...plain('Bold'), bold: true },
        plain(' '),
        { ...plain('Ital'), italic: true },
        plain(' '),
        { ...plain('Under'), underline: true },
      ]]],
    },
  ];
  const xml = text(await build({ chapters }), 'word/document.xml');
  assert.ok(runXml(xml, 'Bold').includes('<w:b/>'));
  assert.ok(runXml(xml, 'Ital').includes('<w:i/>'));
  assert.ok(runXml(xml, 'Under').includes('<w:u '));
  assert.ok(!runXml(xml, 'Bold').includes('<w:i/>'), 'bold run is not italic');
});

test('a styled paragraph keeps the first-line indent and its exceptions', async () => {
  const chapters = [
    {
      title: 'Four',
      scenes: [
        [[plain('A1')], [{ ...plain('Bold'), bold: true }, plain(' tail')]],
        [[{ ...plain('B1'), italic: true }]],
      ],
    },
  ];
  const doc = text(await build({ chapters }), 'word/document.xml');
  assert.match(paragraphStarting(doc, 'Bold'), /w:firstLine="720"/);
  assert.match(runXml(doc, 'Bold'), /<w:b\/>/);
  assert.doesNotMatch(paragraphStarting(doc, 'B1'), /w:firstLine/);
  assert.match(runXml(doc, 'B1'), /<w:i\/>/);
});

test('scene break is a centred paragraph holding only # between scenes', async () => {
  const doc = text(await build(), 'word/document.xml');
  const list = paragraphs(doc);
  const a2 = list.findIndex((p) => textOf(p).startsWith('A2'));
  const hash = list.findIndex((p) => textOf(p) === '#');
  const b1 = list.findIndex((p) => textOf(p).startsWith('B1'));
  assert.ok(hash > a2 && hash < b1, 'break sits between A2 and B1');
  assert.match(list[hash], /<w:jc w:val="center"\/>/);
  assert.doesNotMatch(doc, /\* \* \*/);
});

test('each chapter title opens a new page, is centred, sits a third down, and is followed by one blank paragraph', async () => {
  const doc = text(await build(), 'word/document.xml');
  const list = paragraphs(doc);
  for (const title of ['One', 'Two']) {
    const p = paragraphStarting(doc, title);
    assert.match(p, /<w:pageBreakBefore\/>/);
    assert.match(p, /<w:jc w:val="center"\/>/);
    assert.match(p, /w:before="3840"/);
  }
  const oneIndex = list.findIndex((p) => textOf(p) === 'One');
  assert.equal(textOf(list[oneIndex + 1]), '', 'one blank paragraph after the chapter title');
  assert.equal(textOf(list[oneIndex + 2]), 'A1');
});

test('title page carries the contact block, the word count, the capitalised title and the author', async () => {
  const doc = text(await build(), 'word/document.xml');
  for (const line of ['Jane Writer', '12 Some Street', 'jane@example.com', 'about 87,000 words', 'THE GLASS ORCHARD', 'by J. Q. Ward']) {
    assert.ok(doc.includes(line), `missing "${line}"`);
  }
  const first = paragraphs(doc)[0];
  assert.match(first, /<w:tab\/>/);
  assert.match(first, /w:val="right" w:pos="9360"/);
  assert.doesNotMatch(first, /<w:pageBreakBefore\/>/);
  assert.match(first, /w:line="240"/);
  assert.match(paragraphStarting(doc, 'THE GLASS ORCHARD'), /w:before="5760"/);
});

test('the title starts halfway down the page whatever the contact block length', async () => {
  const ten = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  const cases = [
    ['', 6240], // no contact lines: the word-count line still takes one
    ['Jane Writer\n12 Some Street\njane@example.com', 5760],
    [ten, 4080],
  ];
  for (const [contactBlock, before] of cases) {
    const doc = text(await build({ details: { ...BASE.details, contactBlock } }), 'word/document.xml');
    assert.match(paragraphStarting(doc, 'THE GLASS ORCHARD'), new RegExp(`w:before="${before}"`), `contact block "${contactBlock.slice(0, 20)}"`);
  }
});

test('END is centred and is the last paragraph of text', async () => {
  const doc = text(await build(), 'word/document.xml');
  const list = paragraphs(doc).filter((p) => textOf(p) !== '');
  const last = list[list.length - 1];
  assert.equal(textOf(last), 'END');
  assert.match(last, /<w:jc w:val="center"\/>/);
});

test('running header: titlePg is set and the default header carries the surname, title and PAGE field', async () => {
  const doc = text(await build(), 'word/document.xml');
  assert.match(doc, /<w:titlePg\/>/);
  assert.equal((doc.match(/<w:headerReference w:type="default"/g) ?? []).length, 1);
  const header = headerXml(await build(), 'default');
  assert.ok(header.includes('Ward / GLASS ORCHARD / '), 'header text');
  assert.match(header, /PAGE/);
  assert.match(header, /<w:jc w:val="right"\/>/);
});

test('the first-page header is empty', async () => {
  const header = headerXml(await build(), 'first');
  assert.equal(textOf(header), '');
});

test('chapter notes are never printed in the manuscript', async () => {
  const files = await build({
    chapters: [{ title: 'One', notes: 'secret', scenes: [[[plain('A1')]]] }],
  });
  assert.ok(!text(files, 'word/document.xml').includes('secret'));
});

test('a work with no exportable chapters still builds: title page, then END', async () => {
  const files = await build({ chapters: [], wordCount: 0 });
  const doc = text(files, 'word/document.xml');
  assert.ok(doc.includes('about 100 words'));
  assert.equal(textOf(paragraphs(doc).filter((p) => textOf(p) !== '').pop()), 'END');
});
