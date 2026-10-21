import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { startDb, clearDb } from './support/http.js';
import { unzip } from './support/zip.js';
import { parsePdf } from './support/pdf.js';
import exportRouter from '../src/routes/export.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Settings from '../src/models/Settings.js';
import User from '../src/models/User.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: req.get('x-test-user') || 'user_a' };
  next();
});
app.use('/api/works/:workId/export', exportRouter);
app.use(errorHandler);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const exportAs = (body, workId = 'work_a', user = 'user_a') =>
  request(app)
    .post(`/api/works/${workId}/export`)
    .set('x-test-user', user)
    .send(body)
    .buffer(true)
    .parse(binary);

const prefill = (workId = 'work_a', user = 'user_a') =>
  request(app).get(`/api/works/${workId}/export/manuscript`).set('x-test-user', user);

const documentXml = async (res) => (await unzip(res.body)).get('word/document.xml').toString('utf8');

const FULL = {
  authorName: 'Ada Q. Ward',
  surname: 'Ward',
  contactBlock: 'Ada Ward\n12 Quay Street',
  headerTitle: 'Glass Orchard',
  font: 'serif',
  workOnly: false,
};

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  await User.create({ _id: 'user_a', email: 'a@example.com', name: 'Jane Q. Writer' });
  await User.create({ _id: 'user_b', email: 'b@example.com', name: 'Bo Other' });
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Work A' });
  await Work.create({ _id: 'work_b', ownerId: 'user_a', title: 'Work B' });
  await Work.create({ _id: 'work_other', ownerId: 'user_b', title: 'Other Book' });
  // Two chapters with prose (one with two scenes, one with a chapter note) and an outline chapter
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    status: 'drafting',
    wordCount: 4000,
    notes: 'SECRET CHAPTER NOTE',
    contentHtml: '<p>Opening line.</p><hr data-scene="s1" data-status="draft" /><p>Second scene.</p>',
  });
  await Chapter.create({
    _id: 'ch2',
    workId: 'work_a',
    title: 'Two',
    order: 2,
    status: 'drafting',
    wordCount: 2345,
    contentHtml: '<p>Chapter two text.</p>',
  });
  await Chapter.create({ _id: 'ch3', workId: 'work_a', title: 'Outline only', order: 3, status: 'outline', wordCount: 0 });
});

test('prefill comes from the writer name and the work title when nothing is saved', async () => {
  const res = await prefill();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    authorName: 'Jane Q. Writer',
    surname: 'Writer',
    contactBlock: '',
    headerTitle: 'Work A',
    font: 'serif',
    workOnly: false,
  });
});

test('reading layout output is unchanged when layout is absent or reading (A1)', async () => {
  const absent = await exportAs({ format: 'docx' });
  assert.equal(absent.status, 200);
  const xml = await documentXml(absent);
  assert.ok(xml.includes('* * *'), 'scenes are separated by * * *');
  assert.ok(!xml.includes('<w:titlePg/>'), 'no manuscript title page');
  assert.ok(!xml.includes('SECRET CHAPTER NOTE'), 'chapter notes are off by default');

  const reading = await exportAs({ format: 'docx', layout: 'reading' });
  assert.equal(reading.status, 200);
  assert.equal(await documentXml(reading), xml);

  const pdf = await exportAs({ format: 'pdf' });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  // Font dictionaries are not compressed, so the base font names show in the raw bytes
  const pdfText = pdf.body.toString('latin1');
  assert.ok(pdfText.includes('/BaseFont /Helvetica'), 'reading PDF uses Helvetica');
  assert.ok(!pdfText.includes('/BaseFont /Times-Roman'), 'reading PDF is not the manuscript layout');
});

test('manuscript DOCX has the title page and the rounded word count of the exported chapters', async () => {
  const res = await exportAs({ format: 'docx', layout: 'manuscript', manuscript: FULL });
  assert.equal(res.status, 200);
  const xml = await documentXml(res);
  assert.ok(xml.includes('<w:titlePg/>'));
  assert.ok(xml.includes('about 6,300 words'), '4000 + 2345 rounds to about 6,300 words');
});

test('manuscript DOCX saves the details, and the next prefill returns them', async () => {
  await exportAs({ format: 'docx', layout: 'manuscript', manuscript: FULL });
  const res = await prefill();
  assert.deepEqual(res.body, {
    authorName: 'Ada Q. Ward',
    surname: 'Ward',
    contactBlock: 'Ada Ward\n12 Quay Street',
    headerTitle: 'Glass Orchard',
    font: 'serif',
    workOnly: false,
  });
});

test('manuscript PDF returns a manuscript-layout PDF', async () => {
  const res = await exportAs({ format: 'pdf', layout: 'manuscript', manuscript: FULL });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-');
  const pdfText = res.body.toString('latin1');
  assert.ok(pdfText.includes('/BaseFont /Times-Roman'), 'manuscript PDF uses Times-Roman');
  assert.ok(!pdfText.includes('/Helvetica'), 'manuscript PDF does not use the reading Helvetica');
});

test('workOnly true overrides this work only; another work keeps the writer defaults', async () => {
  const res = await exportAs({
    format: 'docx',
    layout: 'manuscript',
    manuscript: { authorName: 'Pen Name', surname: 'Name', contactBlock: 'Pen Box', font: 'serif', workOnly: true },
  });
  assert.equal(res.status, 200);

  const first = await prefill('work_a');
  assert.equal(first.body.workOnly, true);
  assert.equal(first.body.authorName, 'Pen Name');

  const second = await prefill('work_b');
  assert.equal(second.body.workOnly, false);
  assert.equal(second.body.authorName, 'Jane Q. Writer');
  assert.equal(second.body.surname, 'Writer');
});

test('chapter notes are never printed in the manuscript layout', async () => {
  const res = await exportAs({ format: 'docx', layout: 'manuscript', includeNotes: true, manuscript: FULL });
  assert.equal(res.status, 200);
  const xml = await documentXml(res);
  assert.ok(!xml.includes('SECRET CHAPTER NOTE'));
  assert.ok(!xml.includes('Notes:'));
});

test('an unknown layout is refused with UNSUPPORTED_LAYOUT and saves nothing', async () => {
  const res = await exportAs({ format: 'docx', layout: 'fancy', manuscript: FULL });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body.toString()).code, 'UNSUPPORTED_LAYOUT');
  assert.equal((await Settings.findById('user_a').lean())?.manuscript, undefined);
});

test('manuscript layout with EPUB is refused with UNSUPPORTED_LAYOUT and saves nothing', async () => {
  await Settings.create({
    _id: 'user_a',
    manuscript: { authorName: 'Original Name', surname: 'Name', contactBlock: '', font: 'serif' },
  });
  const res = await exportAs({ format: 'epub', layout: 'manuscript', manuscript: FULL });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body.toString()).code, 'UNSUPPORTED_LAYOUT');
  const settings = await Settings.findById('user_a').lean();
  assert.equal(settings.manuscript.authorName, 'Original Name');
  assert.equal((await Work.findById('work_a').lean()).manuscript, undefined);
});

test('a font outside serif or mono is refused with VALIDATION_ERROR', async () => {
  const res = await exportAs({ format: 'docx', layout: 'manuscript', manuscript: { ...FULL, font: 'sans' } });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body.toString()).code, 'VALIDATION_ERROR');
});

test('a manuscript that is not an object is refused with VALIDATION_ERROR and saves nothing', async () => {
  for (const manuscript of ['Jane', 42, null, ['Jane']]) {
    const res = await exportAs({ format: 'docx', layout: 'manuscript', manuscript });
    assert.equal(res.status, 400, `manuscript ${JSON.stringify(manuscript)}`);
    assert.equal(JSON.parse(res.body.toString()).code, 'VALIDATION_ERROR');
  }
  assert.equal((await Settings.findById('user_a').lean())?.manuscript, undefined);
});

test('another writer gets 404 for prefill and manuscript export, and nothing changes (review focus 5)', async () => {
  await Settings.create({
    _id: 'user_a',
    manuscript: { authorName: 'Original Name', surname: 'Name', contactBlock: '', font: 'serif' },
  });

  const read = await prefill('work_a', 'user_b');
  assert.equal(read.status, 404);

  const write = await exportAs({ format: 'docx', layout: 'manuscript', manuscript: { ...FULL, workOnly: true } }, 'work_a', 'user_b');
  assert.equal(write.status, 404);

  const settings = await Settings.findById('user_a').lean();
  assert.deepEqual(settings.manuscript, { authorName: 'Original Name', surname: 'Name', contactBlock: '', font: 'serif' });
  assert.equal((await Work.findById('work_a').lean()).manuscript, undefined);
});

// A styled chapter in work_b, which has no chapters of its own
const addStyledChapter = (contentHtml) =>
  Chapter.create({ _id: 'styled', workId: 'work_b', title: 'Styled', order: 1, status: 'drafting', wordCount: 5, contentHtml });

const pdfRuns = (res) => parsePdf(res.body).pages.flatMap((page) => page.runs);

test('reading PDF uses bold and oblique Helvetica for styled text', async () => {
  await addStyledChapter('<div>plain <b>bold</b> <i>ital</i> <b><i>both</i></b></div>');
  const res = await exportAs({ format: 'pdf' }, 'work_b');
  assert.equal(res.status, 200);
  const runs = pdfRuns(res);
  const fontOf = (text) => runs.find((run) => run.text.trim() === text)?.font;
  assert.equal(fontOf('plain'), 'Helvetica');
  assert.equal(fontOf('bold'), 'Helvetica-Bold');
  assert.equal(fontOf('ital'), 'Helvetica-Oblique');
  assert.equal(fontOf('both'), 'Helvetica-BoldOblique');
});

test('reading PDF survives a paragraph with line breaks inside styled text', async () => {
  await addStyledChapter('<div><b>a<br></b>b<br><i>c</i></div>');
  const res = await exportAs({ format: 'pdf' }, 'work_b');
  assert.equal(res.status, 200);
  const texts = pdfRuns(res).map((run) => run.text.trim());
  for (const text of ['a', 'b', 'c']) assert.ok(texts.includes(text), `"${text}" is in the PDF`);
});

// The XML of the <w:r> run whose text is `text`
const runXml = (xml, text) => (xml.match(/<w:r>.*?<\/w:r>/g) || []).find((run) => run.includes(`>${text}</w:t>`));

test('reading DOCX marks styled runs', async () => {
  await addStyledChapter('<div>plain <b>bold</b> <i>ital</i> <u>under</u></div>');
  const res = await exportAs({ format: 'docx' }, 'work_b');
  assert.equal(res.status, 200);
  const xml = await documentXml(res);
  assert.ok(runXml(xml, 'bold').includes('<w:b/>'));
  assert.ok(runXml(xml, 'ital').includes('<w:i/>'));
  assert.ok(runXml(xml, 'under').includes('<w:u '));
  const plain = runXml(xml, 'plain ');
  assert.ok(!plain.includes('<w:b/>') && !plain.includes('<w:i/>') && !plain.includes('<w:u '), 'plain text is not styled');
});

test('EPUB chapter keeps <strong> and <em>, and escapes the styled text', async () => {
  await addStyledChapter('<div>plain <b>bold &amp; &lt;x&gt;</b> <i>ital</i></div>');
  const res = await exportAs({ format: 'epub' }, 'work_b');
  assert.equal(res.status, 200);
  const files = await unzip(res.body);
  const chapter = [...files.values()].map((data) => data.toString('utf8')).find((text) => text.includes('<strong>'));
  assert.ok(chapter, 'a chapter file has <strong>');
  assert.ok(chapter.includes('<strong>bold &amp; &lt;x&gt;</strong>'));
  assert.ok(chapter.includes('<em>ital</em>'));
});
