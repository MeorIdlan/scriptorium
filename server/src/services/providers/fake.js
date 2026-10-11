// Deterministic provider for local verification. Only reachable when
// NODE_ENV=test and LLM_PROVIDER_OVERRIDE=fake (see llmService.complete).
const JSON_OBJECT = {
  overall: 'Fake pacing assessment.',
  flags: [],
  summary: 'Fake editorial summary.',
  findings: [],
  suggestions: [{ field: null, text: 'Fake suggestion.' }],
  lastScene: 'Fake last scene.',
  toneNote: 'Fake tone.',
  voiceSample: 'fake voice',
  characterMood: 'Fake mood.',
  suggestedBeat: 'Fake beat.',
  rationale: 'Fake rationale.',
  writingPrompt: 'Fake prompt.',
  tensionScore: 5,
};

export async function complete({ prompt }) {
  if (prompt.includes('Passages to polish:')) {
    const section = prompt.slice(prompt.lastIndexOf('Passages to polish:'));
    const passages = [...section.matchAll(/\[\[([\w-]+)\]\]([\s\S]*?)\[\[\/\1\]\]/g)];
    return passages
      .map(([, id, text]) => `[[${id}]]${text.replace('very ', 'deeply ').replace('walked', 'strode')}[[/${id}]]`)
      .join('\n');
  }
  if (prompt.startsWith('Summarise this chapter')) {
    const title = (prompt.match(/^Chapter [^\n]*$/m) || ['Chapter'])[0];
    return `Fake summary of ${title}.`;
  }
  if (prompt.includes('Return ONLY a JSON array')) {
    return JSON.stringify(['Fake hook one.', 'Fake hook two.', 'Fake hook three.']);
  }
  if (prompt.includes('Return ONLY a JSON object')) {
    return JSON.stringify(JSON_OBJECT);
  }
  // Plain-text routes (polish-draft) echo the prompt so checks can inspect it
  return `ECHO\n${prompt}`;
}
