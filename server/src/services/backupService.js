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
async function* jsonArray(rows, stats) {
  yield '[';
  let first = true;
  for await (const row of rows) {
    yield (first ? '' : ',') + JSON.stringify(row);
    first = false;
    stats.count += 1;
  }
  yield ']';
}

async function* mapped(rows, fn) {
  for await (const row of rows) yield fn(row);
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
  for await (const ch of chapterFiles) {
    const chapterId = String(ch._id);
    const html = chapterHtml(ch);
    yield textEntry(`chapters/${chapterId}.html`, 'chapter-html', chapterId, html);
    yield textEntry(`chapters/${chapterId}.md`, 'chapter-markdown', chapterId, chapterMarkdown(html));
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
