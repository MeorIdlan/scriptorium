import { Router } from 'express';
import { readJSON } from '../services/fileService.js';
import { complete } from '../services/llmService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

const SYSTEM_PROMPT =
  "You are Scriptorium, a fiction writing assistant. The writer stays in control — you assist, never override.";

function handleLlmError(err, next) {
  if (err.code === 'NO_API_KEY') {
    return next(httpError(400, 'NO_API_KEY', err.message));
  }
  return next(err);
}

// POST /api/ai/hooks
router.post('/hooks', async (req, res, next) => {
  try {
    const { workId, premise, genre, tone } = req.body;

    const prompt = `Generate 3 compelling opening hook options for a ${genre || 'fiction'} story.
Tone: ${tone || 'literary'}
Premise: ${premise || 'A story about human connection'}

Return ONLY a JSON array of exactly 3 strings, each being a complete opening hook sentence or paragraph. No other text.
Example format: ["Hook one...", "Hook two...", "Hook three..."]`;

    const raw = await complete({ system: SYSTEM_PROMPT, prompt });

    let hooks;
    try {
      hooks = JSON.parse(raw.trim());
      if (!Array.isArray(hooks)) throw new Error('Not an array');
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for hooks'));
    }

    res.json({ hooks });
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/rekindler
router.post('/rekindler', async (req, res, next) => {
  try {
    const { workId, chapterId, lastContent } = req.body;

    const prompt = `The writer is returning to their work. Help them re-enter the story with a brief rekindler.

Last written content:
${lastContent ? lastContent.slice(-1000) : '(No content yet)'}

Return ONLY a JSON object with these fields:
{
  "lastScene": "1-2 sentence summary of where the story left off",
  "toneNote": "brief note on the current emotional tone",
  "voiceSample": "a short phrase capturing the narrative voice",
  "characterMood": "the primary character's emotional state"
}`;

    const raw = await complete({ system: SYSTEM_PROMPT, prompt });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for rekindler'));
    }

    res.json(result);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/beat-suggest
router.post('/beat-suggest', async (req, res, next) => {
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

    const raw = await complete({ system: SYSTEM_PROMPT, prompt });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for beat suggestion'));
    }

    res.json(result);
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/pacing
router.post('/pacing', async (req, res, next) => {
  try {
    const { workId } = req.body;
    if (!workId) return next(httpError(400, 'MISSING_FIELD', 'workId is required'));

    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const map = readJSON(`works/${workId}/map.json`) || {};

    const chapterSummary = chapters.map((ch) => ({
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

    const raw = await complete({ system: SYSTEM_PROMPT, prompt });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for pacing'));
    }

    res.json(result);
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

    const raw = await complete({ system: SYSTEM_PROMPT, prompt });

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
router.post('/polish-draft', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return next(httpError(400, 'MISSING_FIELD', 'content is required'));
    }

    const prompt = `You are polishing a writer's rough draft. Improve the grammar, fix clumsy sentence structure, and make the prose more expressive and vivid — while keeping the story direction, plot beats, characters, dialogue, and tone exactly as the writer intended.

Rules:
- Do NOT add new plot events, characters, or scenes that are not in the original
- Do NOT change what happens — only how it is written
- Fix grammatical errors, awkward phrasing, and unclear sentences
- Improve word choice and descriptions where the original is flat or generic
- Preserve the writer's voice as much as possible
- Preserve dialogue intent — you may fix grammar within dialogue but do not change what characters mean to say
- Return ONLY the rewritten text with no preamble, commentary, labels, or explanation

Original draft:
${content}`;

    // Use a high token cap — full chapter rewrites need headroom
    const polished = await complete({ system: SYSTEM_PROMPT, prompt, maxTokensOverride: 8000 });

    res.json({ polished });
  } catch (err) {
    handleLlmError(err, next);
  }
});

// POST /api/ai/editor-review
router.post('/editor-review', async (req, res, next) => {
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

    const raw = await complete({ system: EDITOR_SYSTEM, prompt, maxTokensOverride: 2000 });

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
    } catch {
      return next(httpError(500, 'PARSE_ERROR', 'AI returned invalid JSON for editor review'));
    }

    res.json({ mode, ...result });
  } catch (err) {
    handleLlmError(err, next);
  }
});

export default router;
