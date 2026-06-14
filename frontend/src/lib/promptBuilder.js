import { LENGTHS } from "../constants/generator";

export const PROMPT_GENERATOR_SYSTEM_PROMPT = `You are a master creative writing prompt engineer with deep expertise in literary fiction, genre fiction, and narrative craft. Your sole purpose is to create richly detailed, evocative, and precisely tailored writing prompts that inspire exceptional storytelling.

When given story parameters, craft a complete writing prompt that:
- Opens with a persona directive tailored to the specific genre, style, and tone — e.g. "You are a world-class [genre] novelist whose prose is [style] and whose voice carries a [tone] weight." Make it specific to the parameters given, not a generic opener.
- Follows the persona with a clear, compelling task directive that establishes the story's form and central mission
- Weaves all provided parameters into cohesive, specific instructions
- Uses precise, evocative language that itself models the tone and style being requested
- Gives the writer clear direction on structure, atmosphere, voice, and emotional target
- Avoids generic advice — every sentence should feel specific to this story
- Ends with a guiding principle that captures the story's essential spirit

Output ONLY the writing prompt itself. No preamble, no "Here is your prompt:" intro, no meta-commentary. Just the prompt, ready to be handed directly to a writer or AI.`;

export const PROMPT_VARIABLES = [
  { key: "genre",            label: "Genre",            desc: "Selected genre (e.g. Fantasy)" },
  { key: "style",            label: "Writing Style",    desc: "Prose style (e.g. Lyrical)" },
  { key: "pov",              label: "Point of View",    desc: "Narrative POV (e.g. Third-person limited)" },
  { key: "tone",             label: "Tone",             desc: "Emotional register (e.g. Melancholic)" },
  { key: "setting",          label: "Setting",          desc: "Where the story takes place" },
  { key: "themes",           label: "Themes",           desc: "Comma-separated list of selected themes" },
  { key: "protagonist",      label: "Protagonist",      desc: "Character description text" },
  { key: "premise",          label: "Premise",          desc: "Core conflict or inciting event" },
  { key: "direction",        label: "Direction",        desc: "Writer's story direction note" },
  { key: "story_type",       label: "Story Type",       desc: "e.g. 'self-contained one-shot'" },
  { key: "length",           label: "Length",           desc: "Length label (e.g. Short Story)" },
  { key: "length_desc",      label: "Length Desc",      desc: "Word count range (e.g. ~2,000–5,000 words)" },
  { key: "chapter_number",   label: "Chapter Number",   desc: "Chapter number for continuations" },
  { key: "previous_chapter", label: "Previous Chapter", desc: "Previous chapter summary or content" },
];

export function resolvePromptTemplate(template, params) {
  const {
    genre, style, pov, tone, setting, themes, customTheme,
    protagonist, premise, storyGuide, storyType, length, chapterNumber, previousChapter,
  } = params;

  const lengthObj = LENGTHS.find(l => l.id === length);
  const allThemes = [...(themes || []), ...((customTheme || "").trim() ? [customTheme.trim()] : [])];

  const storyTypeLabel = storyType === "oneshot"  ? "self-contained one-shot"
    : storyType === "chapter" ? "opening chapter of a series"
    : `chapter ${chapterNumber} continuation`;

  const vars = {
    genre:            genre || "",
    style:            style || "",
    pov:              pov   || "",
    tone:             tone  || "",
    setting:          setting || "",
    themes:           allThemes.join(", "),
    protagonist:      protagonist || "",
    premise:          premise || "",
    direction:        storyGuide || "",
    story_type:       storyTypeLabel,
    length:           lengthObj?.label || "",
    length_desc:      lengthObj?.desc  || "",
    chapter_number:   String(chapterNumber ?? 2),
    previous_chapter: previousChapter || "",
  };

  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? vars[key] : match
  );
}

export function buildLLMUserMessage({
  genre, style, pov, tone, setting, themes, customTheme,
  protagonist, premise, storyGuide,
  storyType, length, chapterNumber, previousChapter,
}) {
  const lengthObj = LENGTHS.find(l => l.id === length);
  const allThemes = [...themes, ...(customTheme.trim() ? [customTheme.trim()] : [])];
  const parts = [];

  if (storyType === "oneshot") parts.push("Story Format: Self-contained one-shot");
  else if (storyType === "chapter") parts.push("Story Format: Opening chapter of a serialized story");
  else parts.push(`Story Format: Continuation — Chapter ${chapterNumber}`);

  if (lengthObj) parts.push(`Target Length: ${lengthObj.label} (${lengthObj.desc})`);
  if (genre)     parts.push(`Genre: ${genre}`);
  if (style)     parts.push(`Writing Style: ${style}`);
  if (pov)       parts.push(`Point of View: ${pov}`);
  if (tone)      parts.push(`Tone: ${tone}`);
  if (setting)   parts.push(`Setting: ${setting}`);
  if (allThemes.length > 0) parts.push(`Themes: ${allThemes.join(", ")}`);
  if (protagonist) parts.push(`Protagonist: ${protagonist}`);
  if (premise)     parts.push(`Core Premise: ${premise}`);
  if (storyGuide)  parts.push(`Writer's Direction: ${storyGuide}`);

  if (storyType === "continue" && previousChapter) {
    parts.push(`\nPrevious Chapter Context:\n${previousChapter.trim()}`);
  }

  return parts.join("\n");
}

export function buildPrompt({
  genre, style, pov, tone, setting, themes, customTheme,
  protagonist, premise, storyGuide,
  storyType, length, chapterNumber, previousChapter,
}) {
  const lengthObj = LENGTHS.find(l => l.id === length);
  const allThemes = [...themes, ...(customTheme.trim() ? [customTheme.trim()] : [])];
  const lines = [];

  // Persona opener
  const genreLabel = genre ? `${genre} ` : "";
  const traitParts = [];
  if (style) traitParts.push(`your prose is ${style.toLowerCase()}`);
  if (tone)  traitParts.push(`your voice carries a ${tone.toLowerCase()} weight`);
  if (pov)   traitParts.push(`you inhabit your narrators with ${pov.toLowerCase()} precision`);
  const traitClause = traitParts.length > 0 ? ` — ${traitParts.join(", ")}` : "";
  lines.push(`You are a world-class ${genreLabel}novelist${traitClause}. Every sentence you write is deliberate, alive, and deeply felt.`);
  lines.push("");

  if (storyType === "oneshot") {
    lines.push(`Write a complete, self-contained ${genre || "fiction"} story with a full narrative arc — a clear beginning, rising tension, and satisfying resolution.`);
  } else if (storyType === "chapter") {
    lines.push(`Write Chapter 1 of a serialized ${genre || "fiction"} story. Establish the world, introduce the protagonist, and end on a hook that compels the reader to continue.`);
  } else {
    lines.push(`Write Chapter ${chapterNumber} of an ongoing ${genre || "fiction"} story, picking up directly from where the previous chapter left off. Drive the story forward with new tension, revelations, or character development.`);
  }

  lines.push("");

  if (storyGuide) {
    lines.push(`Writer's direction: ${storyGuide}`);
    lines.push(`Let this vision shape the story's direction, atmosphere, and choices throughout. Honour the writer's intent while giving it literary depth.`);
    lines.push("");
  }

  const styleDirectives = [];
  if (style) styleDirectives.push(`a ${style.toLowerCase()} prose style`);
  if (pov)   styleDirectives.push(`a ${pov.toLowerCase()} point of view`);
  if (tone)  styleDirectives.push(`a ${tone.toLowerCase()} tone throughout`);
  if (styleDirectives.length > 0) {
    lines.push(`Employ ${styleDirectives.join(", ")}. Let these choices shape every sentence — from the rhythm of the prose to the emotional register of each scene.`);
    lines.push("");
  }

  if (setting) {
    lines.push(`Setting: ${setting}. Ground the reader in this world through specific, sensory detail — what can be seen, heard, smelled, felt. The environment should feel alive and integral to the story, not merely backdrop.`);
    lines.push("");
  }

  if (protagonist) {
    lines.push(`Protagonist: ${protagonist}. Bring this character to life through their actions, thoughts, and the way others react to them. Show, don't tell, who they are.`);
    lines.push("");
  }

  if (allThemes.length > 0) {
    lines.push(`Weave the following theme${allThemes.length > 1 ? "s" : ""} into the narrative without making them feel heavy-handed: ${allThemes.join(", ")}. Let them emerge naturally from character choices and story events.`);
    lines.push("");
  }

  if (premise) {
    lines.push(`Core premise: ${premise}. This should be the engine that drives every scene — keep returning to it, complicating it, and letting it push characters to their limits.`);
    lines.push("");
  }

  if (storyType === "continue" && previousChapter) {
    lines.push(`Context from the previous chapter:`);
    lines.push(`${previousChapter.trim()}`);
    lines.push("");
    lines.push(`Honour the continuity of what came before. Carry forward unresolved threads, character arcs, and emotional stakes. Do not recap what has happened — trust the reader's memory and push the story forward.`);
    lines.push("");
  }

  if (lengthObj) {
    lines.push(`Target length: ${lengthObj.label} (${lengthObj.desc}). Pace the story accordingly — use the space available to develop scenes with depth, not to pad or rush.`);
    lines.push("");
  }

  lines.push(`Above all: prioritise vivid, specific language over generic description. Every scene should feel inevitable in retrospect. Make the reader feel something.`);

  return lines.join("\n");
}
