// Catch actions built from existing endpoints. `api` is passed in so the
// order of calls and each failure point can be tested with a fake.
const MAX_NAME = 60;
const MAX_LABEL = 120;

const catchPath = (workId, catchItem) => `/works/${workId}/catches/${catchItem.id}`;

export function defaultName(text) {
  const line = (text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.slice(0, MAX_NAME).trim();
}

export function appendNote(existing, text) {
  const current = (existing || '').trimEnd();
  return current ? `${current}\n\n${text}` : text;
}

export const markUsed = (api, workId, catchItem, usedAs = null) =>
  api.put(catchPath(workId, catchItem), { status: 'used', usedAs });

export const markDiscarded = (api, workId, catchItem) => api.put(catchPath(workId, catchItem), { status: 'discarded' });

export const reopen = (api, workId, catchItem) => api.put(catchPath(workId, catchItem), { status: 'open' });

// The entry or text already exists by now, so a failure here leaves the catch open
export async function markUsedAfter(api, workId, catchItem, usedAs) {
  try {
    await markUsed(api, workId, catchItem, usedAs);
    return { ok: true };
  } catch (error) {
    return { ok: false, stage: 'mark', error };
  }
}

const CODEX_TARGETS = {
  character: { path: 'characters', body: (name, text) => ({ name, notes: text }) },
  place: { path: 'places', body: (name, text) => ({ name, notes: text }) },
  rule: { path: 'rules', body: (name, text) => ({ rule: name, description: text }) },
};

export async function useAsCodex(api, workId, catchItem, { type, name, text }) {
  const target = CODEX_TARGETS[type];
  const cleanName = (name || '').trim();
  if (!target) return { ok: false, stage: 'create', error: new Error(`Unknown Codex type: ${type}`) };
  if (!cleanName) return { ok: false, stage: 'create', error: new Error('A name is required') };

  let entry;
  try {
    entry = await api.post(`/works/${workId}/codex/${target.path}`, target.body(cleanName, text));
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
  return markUsedAfter(api, workId, catchItem, {
    kind: `codex-${type}`,
    refId: entry.id,
    label: cleanName.slice(0, MAX_LABEL),
  });
}

export async function useAsMapNote(api, workId, catchItem, { chapterId, chapterLabel, text }) {
  try {
    // Re-read so notes edited elsewhere since the page loaded aren't overwritten
    const map = await api.get(`/works/${workId}/map`);
    const notes = appendNote(map?.chapters?.[chapterId]?.notes, text);
    await api.put(`/works/${workId}/map/chapters/${chapterId}`, { notes });
  } catch (error) {
    return { ok: false, stage: 'create', error };
  }
  return markUsedAfter(api, workId, catchItem, {
    kind: 'map-note',
    refId: chapterId,
    label: chapterLabel.slice(0, MAX_LABEL),
  });
}
