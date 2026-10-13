import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import { ensureSummaries } from './summaryService.js';
import CatchModel from '../models/Catch.js';
import PlotThread from '../models/PlotThread.js';
import { findMentions, formatContextBlock, MAX_CONTEXT_CATCHES } from './contextBlock.js';

// AI calls must never fail because of catches
async function openCatchesFor(workId, chapterId) {
  try {
    const rows = await CatchModel.find({ workId, taggedChapterId: chapterId, status: 'open' })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT_CATCHES)
      .select('content')
      .lean();
    return rows.map((r) => r.content);
  } catch (err) {
    console.error('Loading catches for context failed:', err);
    return [];
  }
}

// Threads for the given tag ids, in tag order; ids that aren't this work's threads are ignored.
// AI calls must never fail because of threads
async function threadsFor(workId, ids) {
  try {
    const wanted = [...new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])];
    if (!wanted.length) return [];
    const rows = await PlotThread.find({ workId, _id: { $in: wanted } })
      .select('name description status')
      .lean();
    const byId = new Map(rows.map((r) => [r._id, r]));
    return wanted.map((id) => byId.get(id)).filter(Boolean);
  } catch (err) {
    console.error('Loading plot threads for context failed:', err);
    return [];
  }
}

export async function buildContext({ work, chapterId, sceneId, sourceText = '', needs = {} }) {
  const workId = work._id;
  const needChapters = Boolean(needs.summaries || needs.mapBeat || needs.scene || needs.sceneList || needs.threads);

  const [chapters, codex, map, catches] = await Promise.all([
    needChapters
      ? Chapter.find({ workId }).select('number title order content summary scenes threadIds').sort({ order: 1 }).lean()
      : [],
    needs.codex ? Codex.findOne({ workId }).lean() : null,
    needs.mapBeat ? MapModel.findOne({ workId }).lean() : null,
    needs.catches && chapterId ? openCatchesFor(workId, chapterId) : [],
  ]);

  // Only chapters of this work count; anything else is ignored
  const current = chapterId ? chapters.find((c) => c._id === chapterId) || null : null;

  let summaries = null;
  let unavailable = 0;
  if (needs.summaries) {
    const targets =
      needs.summaries === 'all'
        ? chapters
        : current
          ? chapters.filter((c) => c.order < current.order)
          : [];
    const withText = targets.filter((c) => c.content && c.content.trim());
    const result = await ensureSummaries(work, withText);
    unavailable = result.unavailable;
    summaries = withText.map((c) => ({
      number: c.number,
      title: c.title,
      text: result.summaries.get(c._id) || '',
    }));
  }

  const mapEntry = current && map?.chapters?.[current._id];
  const mapBeat = needs.mapBeat && mapEntry ? { act: mapEntry.act, beat: mapEntry.beat, notes: mapEntry.notes } : null;

  const chapterScenes = Array.isArray(current?.scenes) ? current.scenes : [];
  const scene = needs.scene && sceneId ? chapterScenes.find((s) => s && s.id === sceneId) || null : null;
  const sceneList = needs.sceneList ? chapterScenes : null;

  // The open scene's tags, or the chapter's when the scene has none (or none is open)
  let tagIds = [];
  if (needs.threads) {
    const openScene = sceneId ? chapterScenes.find((s) => s && s.id === sceneId) : null;
    tagIds = Array.isArray(openScene?.threadIds) && openScene.threadIds.length ? openScene.threadIds : current?.threadIds;
  }
  const threads = needs.threads ? await threadsFor(workId, tagIds) : null;

  const story = needs.story
    ? {
        title: work.title,
        genre: work.genre,
        pov: work.pov,
        tone: work.tone,
        protagonist: work.protagonist,
        premise: work.premise,
      }
    : null;

  const { text, codexNames, rules, scene: sceneSent, sceneList: sceneLines, catches: catchCount, threads: threadNames } = formatContextBlock({
    story,
    summaries,
    mentions: needs.codex ? findMentions(codex, sourceText) : null,
    rules: needs.codex ? codex?.worldRules || [] : null,
    mapBeat,
    scene,
    sceneList,
    catches,
    threads,
  });

  if (!text) return { text: '', manifest: null };

  return {
    text,
    manifest: {
      story: text.includes('## Story\n'),
      summaries: (summaries || []).filter((s) => s.text).length,
      unavailable,
      codex: codexNames,
      rules,
      act: mapBeat?.act || null,
      beat: mapBeat?.beat || null,
      scene: sceneSent,
      sceneList: sceneLines,
      catches: catchCount,
      threads: threadNames,
    },
  };
}
