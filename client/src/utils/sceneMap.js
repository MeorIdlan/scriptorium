const povKey = (pov) => pov.trim().toLowerCase();
const hasPov = (scene) => scene && typeof scene.pov === 'string' && scene.pov.trim() !== '';

export function povOptions(chapters) {
  const seen = new Map();
  for (const chapter of chapters || []) {
    for (const scene of chapter.scenes || []) {
      if (hasPov(scene) && !seen.has(povKey(scene.pov))) seen.set(povKey(scene.pov), scene.pov.trim());
    }
  }
  return [...seen.values()];
}

export function scenesForPov(chapter, pov) {
  const list = (chapter?.scenes || []).map((scene, index) => (scene ? { ...scene, index } : null)).filter(Boolean);
  if (!pov) return list;
  return list.filter((s) => hasPov(s) && povKey(s.pov) === povKey(pov));
}
