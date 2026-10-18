import { createHash } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import { ZipArchive } from 'archiver';
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import Catch from '../models/Catch.js';
import PlotThread from '../models/PlotThread.js';
import Milestone from '../models/Milestone.js';
import Snapshot from '../models/Snapshot.js';
import { chapterHtml } from './sceneMarkers.js';
import { chapterMarkdown } from './chapterMarkdown.js';
import { exportBasename } from '../routes/export.js';

// Same shape the API returns: `id` in place of `_id`, no `__v`
export function toRecord(doc) {
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export function workRecord(work) {
  const { ownerId, ...rest } = toRecord(work);
  return rest;
}

const CHAPTER_META = 'number title order status notes wordCount threadIds summary';

async function* textChunks(text) {
  yield text;
}

// Streams a JSON array one record at a time, so no full list is held in memory
export async function* jsonArray(rows, stats) {
  yield '[';
  let first = true;
  for await (const row of rows) {
    yield (first ? '' : ',') + JSON.stringify(row);
    first = false;
    stats.count += 1;
  }
  yield ']';
}

// Mongoose cursors have no return(), so leaving the loop early (client gone,
// error) would leave the server-side cursor open: close it on every exit path
async function* mapped(rows, fn) {
  try {
    for await (const row of rows) yield fn(row);
  } finally {
    await rows.close?.();
  }
}

function arrayEntry(path, kind, rows) {
  const stats = { count: 0 };
  return { path, kind, chunks: jsonArray(rows, stats), stats };
}

function valueEntry(path, kind, value) {
  return { path, kind, chunks: textChunks(JSON.stringify(value ?? null)), stats: { count: value == null ? 0 : 1 } };
}

function textEntry(path, kind, chapterId, text) {
  return { path, kind, chapterId, chunks: textChunks(text), stats: { count: 1 } };
}

// Yields { path, kind, chapterId?, chunks, stats } in archive order
export async function* workEntries(workId) {
  const work = await Work.findById(workId).lean();
  yield valueEntry('work.json', 'work', workRecord(work));

  yield arrayEntry(
    'chapters.json',
    'chapters',
    mapped(Chapter.find({ workId }).sort({ order: 1 }).select(CHAPTER_META).lean().cursor(), toRecord)
  );
  yield arrayEntry(
    'scenes.json',
    'scenes',
    mapped(Chapter.find({ workId }).sort({ order: 1 }).select('scenes').lean().cursor(), (ch) => ({
      chapterId: String(ch._id),
      scenes: ch.scenes || [],
    }))
  );

  const chapterFiles = Chapter.find({ workId }).sort({ order: 1 }).select('content contentHtml').lean().cursor();
  try {
    for await (const ch of chapterFiles) {
      const chapterId = String(ch._id);
      const html = chapterHtml(ch);
      yield textEntry(`chapters/${chapterId}.html`, 'chapter-html', chapterId, html);
      yield textEntry(`chapters/${chapterId}.md`, 'chapter-markdown', chapterId, chapterMarkdown(html));
    }
  } finally {
    await chapterFiles.close?.();
  }

  const codex = await Codex.findOne({ workId }).lean();
  yield valueEntry('codex.json', 'codex', codex && toRecord(codex));
  const map = await MapModel.findOne({ workId }).lean();
  yield valueEntry('map.json', 'map', map && toRecord(map));

  yield arrayEntry('catches.json', 'catches', mapped(Catch.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord));
  yield arrayEntry('threads.json', 'threads', mapped(PlotThread.find({ workId }).sort({ order: 1 }).lean().cursor(), toRecord));
  yield arrayEntry(
    'milestones.json',
    'milestones',
    mapped(Milestone.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord)
  );
  yield arrayEntry(
    'snapshots.json',
    'snapshots',
    mapped(Snapshot.find({ workId }).sort({ createdAt: 1 }).lean().cursor(), toRecord)
  );
}

export const FORMAT = 'scriptorium-work-backup';
export const FORMAT_VERSION = 1;

// Passes bytes through unchanged, counting and hashing them; onEnd gets the totals
export function measuring(onEnd) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  stream.on('end', () => onEnd({ bytes, sha256: hash.digest('hex') }));
  return stream;
}

export function itemRecord(entry, { bytes, sha256 }) {
  return {
    path: entry.path,
    kind: entry.kind,
    ...(entry.chapterId ? { chapterId: entry.chapterId } : {}),
    count: entry.stats.count,
    bytes,
    sha256,
  };
}

export function buildManifest({ work, items, exportedAt = new Date().toISOString() }) {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt,
    work: { id: String(work._id), title: work.title },
    items,
  };
}

// Appends one entry, hashing it as it's written; resolves with its item record
function appendEntry(archive, entry, source) {
  return new Promise((resolve, reject) => {
    const measure = measuring((stats) => resolve(itemRecord(entry, stats)));
    source.on('error', reject);
    measure.on('error', reject);
    source.pipe(measure);
    archive.append(measure, { name: entry.path });
  });
}

export async function writeWorkBackup(work, output, { entries = workEntries } = {}) {
  // The client may already be gone: its 'close' has fired and would never be heard
  if (output.destroyed || output.closed) throw new Error('backup aborted: client disconnected');
  const archive = new ZipArchive({ zlib: { level: 6 } });
  let finished = false;

  // Rejects if the archive fails or the client goes away, so no await can hang.
  // archiver 8 emits no 'abort' event, so the output's 'close' is the disconnect signal.
  const failed = new Promise((_, reject) => {
    archive.on('error', reject);
    output.once('close', () => {
      if (!finished) reject(new Error('backup aborted: client disconnected'));
    });
  });
  failed.catch(() => {});

  // An output error must not become an uncaught exception; its 'close' drives the rejection
  output.on('error', () => {});
  archive.pipe(output);
  const items = [];
  let source = null;
  try {
    for await (const entry of entries(String(work._id))) {
      source = Readable.from(entry.chunks, { objectMode: false });
      const appended = appendEntry(archive, entry, source);
      appended.catch(() => {});
      items.push(await Promise.race([appended, failed]));
      source = null;
    }
    archive.append(JSON.stringify(buildManifest({ work, items }), null, 2), { name: 'manifest.json' });
    await Promise.race([archive.finalize(), failed]);
    finished = true;
    return items;
  } catch (err) {
    source?.destroy();
    // abort() ends the piped output; on failure the caller decides how the response ends
    archive.unpipe(output);
    archive.abort();
    throw err;
  }
}

export const ACCOUNT_FORMAT = 'scriptorium-account-backup';
export const ACCOUNT_FORMAT_VERSION = 1;

export function accountEntryPath(work) {
  return `works/${exportBasename(work.title)}-${String(work._id)}.zip`;
}

// Streams an account archive: one stored inner zip per work, then account manifest.json.
// Each inner zip is written by writeWorkBackup into a PassThrough that feeds the outer archive,
// so works are read one at a time and only the current one is in memory.
export async function writeAccountBackup(works, output, { entries } = {}) {
  if (output.destroyed || output.closed) throw new Error('backup aborted: client disconnected');
  const archive = new ZipArchive({ zlib: { level: 6 } });
  let finished = false;
  let inner = null;

  // Same rules as writeWorkBackup: an archive error or the client leaving rejects every await
  const failed = new Promise((_, reject) => {
    archive.on('error', reject);
    output.once('close', () => {
      if (!finished) reject(new Error('backup aborted: client disconnected'));
    });
  });
  failed.catch(() => {});

  output.on('error', () => {});
  archive.pipe(output);
  const items = [];
  try {
    for await (const work of works) {
      if (output.destroyed || output.closed) throw new Error('backup aborted: client disconnected');
      inner = new PassThrough();
      const path = accountEntryPath(work);
      const zipped = new Promise((resolve, reject) => {
        const measure = measuring(resolve);
        measure.on('error', reject);
        inner.pipe(measure);
        archive.append(measure, { name: path, store: true });
      });
      const written = writeWorkBackup(work, inner, { entries });
      written.catch(() => {});
      const [, stats] = await Promise.race([Promise.all([written, zipped]), failed]);
      items.push({ path, workId: String(work._id), title: work.title, ...stats });
      inner = null;
    }
    const manifest = {
      format: ACCOUNT_FORMAT,
      formatVersion: ACCOUNT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      works: items,
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    await Promise.race([archive.finalize(), failed]);
    finished = true;
    return items;
  } catch (err) {
    inner?.destroy();
    archive.unpipe(output);
    archive.abort();
    throw err;
  }
}
