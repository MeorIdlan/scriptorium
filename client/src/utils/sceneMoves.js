export function moveSceneRequest(api, workId, { chapterId, scene, toChapterId, toIndex }) {
  return api.post(`/works/${workId}/chapters/${chapterId}/scenes/move`, {
    sceneId: scene.id || 'opening',
    toChapterId,
    toIndex,
  });
}

// Another chapter's scenes come from the chapter list; a chapter without
// markers is one scene when it has text
export function destinationScenes(chapter) {
  const stored = Array.isArray(chapter?.scenes) ? chapter.scenes : [];
  if (stored.length) return stored.map((s, index) => ({ title: s?.title || '', index }));
  return chapter?.wordCount > 0 ? [{ title: 'Whole chapter', index: 0 }] : [];
}

// Dropping on a row takes that row's place
export function dropIndex(fromIndex, overIndex) {
  return fromIndex === overIndex ? null : overIndex;
}
