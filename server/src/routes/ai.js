import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import MapModel from '../models/Map.js';
import Codex from '../models/Codex.js';
import { complete } from '../services/llmService.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWorkFromBody } from '../middleware/loadWork.js';
import { buildContext } from '../services/storyContextService.js';
import { validateTargets, targetWords, maxTokensFor, buildPolishPrompt, parseRewrites } from '../services/polishService.js';

const router = Router();

const SYSTEM_PROMPT =
  "You are Scriptorium, a fiction writing assistant. The writer stays in control — you assist, never override.";

function handleLlmError(err, next) {
  if (err.code === 'NO_API_KEY') {
    return next(httpError(400, 'NO_API_KEY', err.message));
  }
  return next(err);
}

// Builds story context for a route; routes without a work get none
async function contextFor(req, needs, sourceText = '') {
  if (!req.work) return { text: '', manifest: null };
  const chapterId = typeof req.body.chapterId === 'string' ? req.body.chapterId : undefined;
  return buildContext({ work: req.work, chapterId, sourceText, needs });
}

function withContext(context, prompt) {
  return context.text ? `${context.text}\n\n${prompt}` : prompt;
}

function respond(res, body, context) {
  res.json(context.manifest ? { ...body, context: context.manifest } : body);
}

// POST /api/ai/hooks
router.post('/hooks', loadWorkFromBody({ optional: true }), async (req, res, next) => {
  try {
    // The New Work wizard sends the fields directly (no work yet); the editor
    // sends workId plus the current scene
    const work = req.work || {};
    const genre = req.body.genre || work.genre;
    const tone = req.body.tone || work.tone;
    const premise = req.body.premise || work.premise;
    const protagonist = req.body.protagonist || work.protagonist;
    const title = req.body.title || work.title;
    const scene = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      scene
    );

    const details = [
      title && `Title: ${title}`,
      `Genre: ${genre || 'fiction'}`,
      `Tone: ${tone || 'literary'}`,
      premise && `Premise: ${premise}`,
      protagonist && `Protagonist: ${protagonist}`,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = scene
      ? `Generate 3 compelling hooks for the scene below: openings or turns that would pull the reader into it. Match the story's voice.

${details}

Current scene:
${scene.slice(0, 3000)}

Return ONLY a JSON array of exactly 3 strings, each being a complete hook sentence or short paragraph. No other text.
Example format: ["Hook one...", "Hook two...", "Hook three..."]`
      : `Generate 3 compelling opening hook options for a ${genre || 'fiction'} story.

${details}

Return ONLY a JSON array of exactly 3 strings, each being a complete opening hook sentence or paragraph. No other text.
Example format: ["Hook one...", "Hook two...", "Hook three..."]`;

    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), userId: req.user.id });

    let hooks;
    try {
      const arrayMatch = raw.match(/\[[\s\S]*\]/);
      hooks = JSON.parse(arrayMatch ? arrayMatch[0] : raw.trim());
      if (!Array.isArray(hooks)) throw new Error('Not an array');
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for hooks'));
    }

    respond(res, { hooks }, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/rekindler
router.post('/rekindler', loadWorkFromBody(), async (req, res, next) => {
  try {
    // Where the writer left off: the most recently saved chapter
    const chapter = await Chapter.findOne({ workId: req.work.id, content: { $nin: ['', null] } })
      .select('_id title content')
      .sort({ updatedAt: -1 });
    const lastContent = chapter?.content || '';
    req.body.chapterId = chapter?._id;
    const context = await contextFor(req, { story: true, summaries: 'before', mapBeat: true });

    const prompt = `The writer is returning to their work. Help them re-enter the story with a brief rekindler.

Work: ${req.work.title}${chapter ? `\nChapter: ${chapter.title}` : ''}

Last written content:
${lastContent ? lastContent.slice(-1500) : '(No content yet)'}

Return ONLY a JSON object with these fields:
{
  "lastScene": "1-2 sentence summary of where the story left off",
  "toneNote": "brief note on the current emotional tone",
  "voiceSample": "a short phrase capturing the narrative voice",
  "characterMood": "the primary character's emotional state"
}`;

    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for rekindler'));
    }

    respond(res, result, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/beat-suggest
router.post('/beat-suggest', loadWorkFromBody({ optional: true }), async (req, res, next) => {
  try {
    const { workId, gapBetweenChapterIds, framework, previousBeat, nextBeat } = req.body;

    const prompt = `Suggest a story beat to fill a gap in the narrative.

Story framework: ${framework || 'Three-act structure'}
Previous beat: ${previousBeat || '(beginning of story)'}
Next beat: ${nextBeat || '(end of story)'}

Return ONLY a JSON object:
{
  "suggestedBeat": "description of the beat that should go here",
  "rationale": "why this beat works narratively",
  "writingPrompt": "a brief writing prompt to help the writer draft this scene"
}`;

    const context = await contextFor(req, { story: true, summaries: 'all' });
    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for beat suggestion'));
    }

    respond(res, result, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/pacing
router.post('/pacing', loadWorkFromBody(), async (req, res, next) => {
  try {
    const workId = req.work.id;

    const chapters = await Chapter.find({ workId }).select('-content -contentHtml -draftHistory').sort({ order: 1 });
    const map = (await MapModel.findOne({ workId }).lean()) || {};

    const chapterSummary = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      wordCount: ch.wordCount || 0,
      tensionScore: map.chapters?.[ch.id]?.tensionScore,
      beat: map.chapters?.[ch.id]?.beat,
    }));

    const prompt = `Analyse the pacing of this story based on chapter data:

Chapters: ${JSON.stringify(chapterSummary, null, 2)}
Framework: ${map.framework || 'unspecified'}

Return ONLY a JSON object:
{
  "overall": "brief overall pacing assessment",
  "flags": [
    { "chapterIds": ["ch_id"], "note": "specific pacing note" }
  ]
}`;

    const context = await contextFor(req, { story: true, summaries: 'all' });
    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for pacing'));
    }

    respond(res, result, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/tension-infer
router.post('/tension-infer', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) return next(httpError(400, 'MISSING_FIELD', 'content is required'));

    const prompt = `Analyse the dramatic tension in this passage and give it a score from 1-10.

Passage:
${content.slice(0, 3000)}

Return ONLY a JSON object:
{
  "tensionScore": 7,
  "rationale": "brief explanation of the tension level"
}`;

    const raw = await complete({ system: SYSTEM_PROMPT, prompt, userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for tension inference'));
    }

    res.json(result);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/polish-draft
// Rewrites only the given target passages; the whole chapter goes along as context
router.post('/polish-draft', loadWorkFromBody(), async (req, res, next) => {
  try {
    const { targets } = req.body;
    const chapterText = typeof req.body.chapterText === 'string' ? req.body.chapterText : '';
    const invalid = validateTargets(targets);
    if (invalid) return next(httpError(400, invalid.code, invalid.message));

    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      targets.map((t) => t.text).join('\n\n')
    );
    const prompt = buildPolishPrompt({ chapterText, targets });

    const raw = await complete({
      system: SYSTEM_PROMPT,
      prompt: withContext(context, prompt),
      maxTokensOverride: maxTokensFor(targetWords(targets)),
      userId: req.user.id,
    });

    const { rewrites, missing } = parseRewrites(raw, targets.map((t) => t.id));
    respond(res, { rewrites, missing }, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/editor-review
router.post('/editor-review', loadWorkFromBody(), async (req, res, next) => {
  try {
    const { content, mode = 'full' } = req.body;
    if (!content || !content.trim()) {
      return next(httpError(400, 'MISSING_FIELD', 'content is required'));
    }

    const EDITOR_SYSTEM =
      'You are an experienced literary editor — honest, precise, and constructive. Your job is to help the writer improve their prose without rewriting their story for them.';

    const prompts = {
      full: `Give editorial feedback on this fiction draft. Analyse prose quality, scene effectiveness, pacing, character work, dialogue, and show-vs-tell balance.

Return ONLY a JSON object:
{
  "summary": "2-3 sentence overall editorial take on this passage",
  "flags": [
    {
      "excerpt": "exact short quote from the text (1-2 sentences max)",
      "issue": "what needs attention and why",
      "suggestion": "concrete, specific suggestion for improvement"
    }
  ]
}

Limit flags to the 4-6 most impactful observations. Be direct and specific.

Draft:
${content.slice(0, 6000)}`,

      'show-tell': `Identify passages in this fiction draft where the writer tells the reader something that would be more powerful if shown through action, dialogue, or sensory detail.

Return ONLY a JSON object:
{
  "summary": "brief overall note on the show-vs-tell balance in this passage",
  "flags": [
    {
      "excerpt": "exact quoted text that tells rather than shows",
      "issue": "what is being told and why showing would land harder",
      "suggestion": "brief example of how to show this instead"
    }
  ]
}

Limit to 3-5 most impactful instances. Only flag passages where showing would genuinely strengthen the prose.

Draft:
${content.slice(0, 6000)}`,

      voice: `Check this fiction draft for voice and consistency issues: POV shifts, tense inconsistencies, adverb overuse (-ly words that weaken verbs), passive voice where active would be stronger, and repetitive sentence structures.

Return ONLY a JSON object:
{
  "summary": "brief overall note on the voice and consistency of this passage",
  "flags": [
    {
      "excerpt": "exact quoted text with the issue",
      "issue": "specific problem type (e.g. POV shift, passive voice, adverb) and why it weakens the prose",
      "suggestion": "how to tighten or fix this"
    }
  ]
}

Limit to the 4-6 most notable issues.

Draft:
${content.slice(0, 6000)}`,
    };

    const prompt = prompts[mode];
    if (!prompt) return next(httpError(400, 'INVALID_MODE', `Unknown editor mode: ${mode}`));

    const context = await contextFor(
      req,
      { story: true, codex: true, summaries: 'before', mapBeat: true },
      content
    );

    const raw = await complete({ system: EDITOR_SYSTEM, prompt: withContext(context, prompt), maxTokensOverride: 2000, userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for editor review'));
    }

    respond(res, { mode, ...result }, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/codex-audit
router.post('/codex-audit', loadWorkFromBody(), async (req, res, next) => {
  try {
    const workId = req.work.id;

    const codex = (await Codex.findOne({ workId }).lean()) || { characters: [], places: [], worldRules: [] };

    const codexSummary = {
      characters: (codex.characters || []).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        aliases: c.aliases,
        affiliations: c.affiliations,
        notes: c.notes,
        physical: c.physical,
      })),
      places: (codex.places || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        notes: p.notes,
      })),
      worldRules: (codex.worldRules || []).map((r) => ({
        id: r.id,
        category: r.category,
        rule: r.rule,
        description: r.description,
      })),
    };

    const totalEntries =
      codexSummary.characters.length +
      codexSummary.places.length +
      codexSummary.worldRules.length;

    if (totalEntries === 0) {
      return res.json({
        summary: 'Your codex is empty. Add some characters, places, or world rules to get started.',
        findings: [],
      });
    }

    const prompt = `You are auditing a fiction writer's Codex — the reference document that tracks characters, places, and world rules for their story.

Codex contents:
${JSON.stringify(codexSummary, null, 2)}

Analyse the codex and return a structured audit with these goals:
1. Flag incomplete or sparse entries that could use more detail
2. Identify potential internal consistency issues or contradictions between entries
3. Note characters or places that seem underdeveloped
4. Suggest improvements or missing information that would strengthen the worldbuilding

Return ONLY a JSON object:
{
  "summary": "2-3 sentence overall assessment of the codex",
  "findings": [
    {
      "entityType": "character | place | worldRule | general",
      "entityName": "name of the entry, or null for general findings",
      "issue": "what needs attention",
      "suggestion": "concrete suggestion for improvement"
    }
  ]
}

Limit findings to the 5-8 most impactful observations. Be specific and constructive.`;

    const context = await contextFor(req, { story: true });
    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), maxTokensOverride: 2000, userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for codex audit'));
    }

    respond(res, result, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/codex-suggest
router.post('/codex-suggest', loadWorkFromBody(), async (req, res, next) => {
  try {
    const { entityType, entity } = req.body;
    if (!entityType || !entity) {
      return next(httpError(400, 'MISSING_FIELD', 'entityType and entity are required'));
    }

    const prompts = {
      character: `Suggest improvements and expansions for this character in a fiction writer's codex.

Character data:
${JSON.stringify(entity, null, 2)}

Focus on: missing backstory elements, character arc potential, relationship dynamics, distinguishing traits, internal conflicts, and how this character's role shapes the story. Be specific about what's missing or underdeveloped.

Return ONLY a JSON object:
{
  "suggestions": [
    { "field": "optional field name this applies to (e.g. notes, backstory, arc)", "text": "specific suggestion" }
  ]
}

Limit to 4-6 specific, actionable suggestions.`,

      place: `Suggest improvements and expansions for this location in a fiction writer's codex.

Place data:
${JSON.stringify(entity, null, 2)}

Focus on: atmosphere and sensory details, narrative function, unique characteristics, history or lore, and how characters might interact with or be shaped by this place. Be specific about what's missing.

Return ONLY a JSON object:
{
  "suggestions": [
    { "field": "optional field name this applies to (e.g. description, atmosphere, history)", "text": "specific suggestion" }
  ]
}

Limit to 4-6 specific, actionable suggestions.`,

      worldRule: `Suggest improvements and expansions for this world rule in a fiction writer's codex.

Rule data:
${JSON.stringify(entity, null, 2)}

Focus on: implications and edge cases, how characters might exploit or be constrained by this rule, potential contradictions or loopholes, narrative opportunities this rule creates, and what would happen if this rule were violated.

Return ONLY a JSON object:
{
  "suggestions": [
    { "field": null, "text": "specific suggestion, implication, or edge case to explore" }
  ]
}

Limit to 4-6 specific, actionable suggestions.`,
    };

    const prompt = prompts[entityType];
    if (!prompt) return next(httpError(400, 'INVALID_TYPE', `Unknown entity type: ${entityType}`));

    const context = await contextFor(req, { story: true });

    const raw = await complete({ system: SYSTEM_PROMPT, prompt: withContext(context, prompt), maxTokensOverride: 1500, userId: req.user.id });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for codex suggestions'));
    }

    respond(res, result, context);
  } catch (err) {
    handleLlmError(err, next);
  }
});

export default router;
