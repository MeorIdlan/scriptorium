// Which chapter the Main Room should fetch, or null when it already has it.
// The editor's chapter id lives in EditorContext and outlives the Main Room,
// so "loaded" is tracked by the page itself (loadedChapterId), not the context.
export function chapterToLoad({ urlChapterId, work, chapters, editorChapterId, loadedChapterId }) {
  if (!chapters || chapters.length === 0) return null;
  const target = urlChapterId || work?.currentChapterId || chapters[0]?.id;
  if (!target) return null;
  return target !== editorChapterId || target !== loadedChapterId ? target : null;
}
