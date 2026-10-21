import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManuscriptPDF } from '../src/services/manuscriptExport.js';
import { parsePdf } from './support/pdf.js';

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

// Sixty paragraphs of eighty words: a chapter that runs over several pages.
const LONG = {
  title: 'Three',
  scenes: [
    Array.from({ length: 60 }, (_, p) => [
      plain(Array.from({ length: 80 }, (_, w) => `p${p}w${w}`).join(' ')),
    ]),
  ],
};

const HEADER = 'Ward / GLASS ORCHARD / ';

async function build(overrides = {}, options = { compress: false }) {
  return parsePdf(await buildManuscriptPDF({ ...BASE, ...overrides }, options));
}

const isHeader = (run) => run.text.startsWith(HEADER);
const allRuns = (pdf) => pdf.pages.flatMap((page) => page.runs);
const bodyRuns = (pdf) => allRuns(pdf).filter((run) => !isHeader(run));

function findRun(pdf, text) {
  const run = allRuns(pdf).find((r) => r.text === text);
  assert.ok(run, `no run "${text}"`);
  return run;
}

test('every page is US Letter', async () => {
  const pdf = await build();
  assert.ok(pdf.pages.length >= 3);
  for (const page of pdf.pages) assert.deepEqual([page.width, page.height], [612, 792]);
});

test('body text is 12 pt Times-Roman, and Courier for mono', async () => {
  const runs = bodyRuns(await build());
  assert.ok(runs.length > 0);
  for (const run of runs) {
    assert.equal(run.font, 'Times-Roman');
    assert.equal(run.size, 12);
  }
  const mono = bodyRuns(await build({ details: { ...BASE.details, font: 'mono' } }));
  assert.ok(mono.length > 0);
  for (const run of mono) assert.equal(run.font, 'Courier');
});

test('body text stays inside 1 inch margins', async () => {
  const runs = bodyRuns(await build({ chapters: [LONG] }));
  assert.ok(runs.length > 100);
  for (const run of runs) {
    assert.ok(run.x >= 71.5, `x ${run.x} for "${run.text}"`);
    assert.ok(run.y >= 71.5 && run.y <= 720.5, `y ${run.y} for "${run.text}"`);
  }
});

test('manuscript PDF prints bold as Times-Bold', async () => {
  const chapters = [{ title: 'Four', scenes: [[[{ ...plain('heavy'), bold: true }]]] }];
  assert.equal(findRun(await build({ chapters }), 'heavy').font, 'Times-Bold');
});

test('manuscript PDF prints italic as Times-Italic, and Courier-Oblique for mono', async () => {
  const chapters = [{ title: 'Four', scenes: [[[{ ...plain('slant'), italic: true }]]] }];
  assert.equal(findRun(await build({ chapters }), 'slant').font, 'Times-Italic');
  const mono = await build({ chapters, details: { ...BASE.details, font: 'mono' } });
  assert.equal(findRun(mono, 'slant').font, 'Courier-Oblique');
});

test('a styled paragraph keeps the first-line indent and its exceptions', async () => {
  const pdf = await build({
    chapters: [
      {
        title: 'Four',
        scenes: [
          [[plain('A1')], [{ ...plain('Bold'), bold: true }, plain(' tail')]],
          [[{ ...plain('B1'), italic: true }]],
        ],
      },
    ],
  });
  assert.ok(Math.abs(findRun(pdf, 'Bold').x - 108) < 0.5, `bold x ${findRun(pdf, 'Bold').x}`);
  assert.equal(findRun(pdf, 'Bold').font, 'Times-Bold');
  // The rest of the line follows the bold run, with no second indent
  assert.ok(Math.abs(findRun(pdf, ' tail').x - 132) < 0.5, `tail x ${findRun(pdf, ' tail').x}`);
  assert.ok(Math.abs(findRun(pdf, 'B1').x - 72) < 0.5, `B1 x ${findRun(pdf, 'B1').x}`);
  assert.equal(findRun(pdf, 'B1').font, 'Times-Italic');
});

test('a <br> inside an italic run starts an unindented line and stays italic', async () => {
  const pdf = await build({
    chapters: [{ title: 'Four', scenes: [[[plain('A1')], [{ ...plain('first\nsecond'), italic: true }]]] }],
  });
  assert.ok(Math.abs(findRun(pdf, 'first').x - 108) < 0.5, `first x ${findRun(pdf, 'first').x}`);
  assert.ok(Math.abs(findRun(pdf, 'second').x - 72) < 0.5, `second x ${findRun(pdf, 'second').x}`);
  assert.equal(findRun(pdf, 'first').font, 'Times-Italic');
  assert.equal(findRun(pdf, 'second').font, 'Times-Italic');
});

test('three or more runs on a line continue it, and the next paragraph is one line down', async () => {
  const pdf = await build({
    chapters: [
      {
        title: 'Four',
        scenes: [[[plain('She said '), { ...plain('no'), italic: true }, plain(' and left.')], [plain('next')]]],
      },
    ],
  });
  const no = findRun(pdf, 'no');
  const rest = findRun(pdf, ' and left.');
  assert.ok(Math.abs(rest.y - no.y) < 0.5, `rest y ${rest.y} on the line of "no" ${no.y}`);
  assert.ok(rest.x > no.x, `rest x ${rest.x} after "no" x ${no.x}`);
  const start = findRun(pdf, 'She said ');
  assert.ok(Math.abs(findRun(pdf, 'next').y - start.y - 24) < 0.5, `next y ${findRun(pdf, 'next').y}`);
});

test('the scene break, END and running header after a styled run are in the regular font', async () => {
  const pdf = await build({
    chapters: [
      {
        title: 'Four',
        scenes: [[[{ ...plain('end of scene'), bold: true }]], [[{ ...plain('end of book'), italic: true }]]],
      },
    ],
  });
  assert.equal(findRun(pdf, '#').font, 'Times-Roman');
  assert.equal(findRun(pdf, 'END').font, 'Times-Roman');
  const headers = allRuns(pdf).filter(isHeader);
  assert.ok(headers.length > 0, 'there are running headers');
  for (const header of headers) assert.equal(header.font, 'Times-Roman', header.text);
});

test('wrapped lines are double spaced: 24 pt baseline to baseline', async () => {
  // Page 3 is a continuation page of the long chapter, so all its body lines are wrapped.
  const pdf = await build({ chapters: [LONG] });
  const lines = pdf.pages[2].runs.filter((run) => !isHeader(run));
  assert.ok(lines.length > 20);
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].y - lines[i - 1].y;
    assert.ok(Math.abs(gap - 24) <= 0.5, `gap ${gap} between "${lines[i - 1].text}" and "${lines[i].text}"`);
  }
});

test('first line of a paragraph is indented; chapter openers and the paragraph after a break are not', async () => {
  const pdf = await build();
  assert.ok(Math.abs(findRun(pdf, 'A2 line').x - 108) < 0.5);
  for (const text of ['A1', 'B1', 'C1']) assert.ok(Math.abs(findRun(pdf, text).x - 72) < 0.5, text);
});

test('a line break inside a paragraph starts an unindented line', async () => {
  const pdf = await build();
  assert.ok(Math.abs(findRun(pdf, 'break').x - 72) < 0.5);
});

test('scene break is a centred # and no * * * ornament', async () => {
  const pdf = await build();
  const hash = findRun(pdf, '#');
  assert.ok(hash.x > 290 && hash.x < 310, `x ${hash.x}`);
  assert.ok(!allRuns(pdf).some((run) => run.text.includes('* * *')));
});

test('each chapter title is the first body text on its own page, about a third down', async () => {
  const pdf = await build();
  for (const [index, title] of [[1, 'One'], [2, 'Two']]) {
    const page = pdf.pages[index];
    const first = page.runs.find((run) => !isHeader(run));
    assert.equal(first.text, title);
    const ratio = first.y / page.height;
    assert.ok(ratio >= 0.3 && ratio <= 0.4, `ratio ${ratio}`);
  }
});

test('title page: contact block, word count top right, centred title, author, no header', async () => {
  const pdf = await build();
  const page = pdf.pages[0];
  for (const line of ['Jane Writer', '12 Some Street', 'jane@example.com']) {
    assert.ok(page.runs.some((run) => run.text === line), `missing "${line}"`);
  }
  const count = page.runs.find((run) => run.text === 'about 87,000 words');
  assert.ok(count && count.x > 306, `word count ${JSON.stringify(count)}`);
  const title = page.runs.find((run) => run.text === 'THE GLASS ORCHARD');
  assert.ok(title, 'missing title');
  const ratio = title.y / page.height;
  assert.ok(ratio >= 0.45 && ratio <= 0.55, `title ratio ${ratio}`);
  assert.ok(page.runs.some((run) => run.text === 'by J. Q. Ward'));
  assert.ok(!page.runs.some(isHeader));
});

test('a long first contact line wraps clear of the word count on the title page', async () => {
  const pdf = await build({
    details: { ...BASE.details, contactBlock: 'Jane Writer, 12 Some Street, Springfield, Northern Province, Anytown, jane@example.com\nSecond' },
  });
  const email = allRuns(pdf).find((run) => run.text.includes('jane@example.com'));
  assert.ok(email && email.y > 81, `first line still runs under the count: ${JSON.stringify(email)}`);
});

test('running header on every page after the title page, each with its own page number', async () => {
  const pdf = await build({ chapters: [LONG] });
  assert.ok(pdf.pages.length >= 4, `pages ${pdf.pages.length}`);
  pdf.pages.forEach((page, i) => {
    if (i === 0) {
      assert.ok(!page.runs.some(isHeader), 'title page has a header');
      return;
    }
    const header = page.runs.find((run) => run.text === `${HEADER}${i + 1}`);
    assert.ok(header, `no header "${HEADER}${i + 1}" on page ${i + 1}`);
    assert.ok(header.y < 72, `header y ${header.y}`);
  });
});

test('a long running header stays on one line above the body and keeps its page number', async () => {
  const headerTitle = 'Word '.repeat(38).trim(); // 189 characters
  const pdf = await build({ details: { ...BASE.details, headerTitle }, chapters: [LONG] });
  pdf.pages.slice(1).forEach((page, i) => {
    const headers = page.runs.filter((run) => run.y < 72);
    assert.equal(headers.length, 1, `page ${i + 2} has ${headers.length} header lines`);
    assert.ok(headers[0].text.startsWith('Ward / '), headers[0].text);
    assert.ok(headers[0].text.endsWith(` / ${i + 2}`), headers[0].text);
    assert.ok(headers[0].x >= 71.5, `header x ${headers[0].x}`);
  });
});

test('END is the last text, one blank line after the last paragraph', async () => {
  const pdf = await build();
  const runs = pdf.pages.at(-1).runs.filter((run) => !isHeader(run));
  assert.equal(runs.at(-1).text, 'END');
  const last = findRun(pdf, 'C1');
  assert.ok(Math.abs(runs.at(-1).y - last.y - 48) < 0.5, `END y ${runs.at(-1).y} after C1 y ${last.y}`);
});

test('a work with no exportable chapters still builds: about 100 words, then END', async () => {
  const pdf = await build({ chapters: [], wordCount: 0 });
  assert.equal(pdf.pages.length, 1);
  assert.ok(pdf.pages[0].runs.some((run) => run.text === 'about 100 words'));
  assert.equal(pdf.pages[0].runs.at(-1).text, 'END');
});

test('non-Latin text builds without throwing', async () => {
  const pdf = await build({ chapters: [{ title: 'Four', scenes: [[[plain('“Ægir” — 東京')]]] }] });
  assert.ok(allRuns(pdf).some((run) => run.text.includes('gir')));
});

test('compression is on by default and the layout reads back the same', async () => {
  const raw = await buildManuscriptPDF(BASE, { compress: false });
  const packed = await buildManuscriptPDF(BASE);
  assert.ok(packed.includes('FlateDecode'));
  assert.deepEqual(parsePdf(packed), parsePdf(raw));
});
