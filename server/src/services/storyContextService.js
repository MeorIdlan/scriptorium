import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import { ensureSummaries } from './summaryService.js';
import CatchModel from '../models/Catch.js';
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

export async function buildContext({ work, chapterId, sourceText = '', needs = {} }) {
  const workId = work._id;
  const needChapters = Boolean(needs.summaries || needs.mapBeat);

  const [chapters, codex, map, catches] = await Promise.all([
    needChapters
      ? Chapter.find({ workId }).select('number title order content summary').sort({ order: 1 }).lean()
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

  const { text, codexNames, rules, catches: catchCount } = formatContextBlock({
    story,
    summaries,
    mentions: needs.codex ? findMentions(codex, sourceText) : null,
    rules: needs.codex ? codex?.worldRules || [] : null,
    mapBeat,
    catches,
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
      catches: catchCount,
    },
  };
}
