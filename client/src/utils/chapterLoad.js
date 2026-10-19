// Which chapter the Main Room should fetch, or null when it already has it.
// The editor's chapter id lives in EditorContext and outlives the Main Room,
// so "loaded" is tracked by the page itself (loadedChapterId), not the context.
export function chapterToLoad({ urlChapterId, work, chapters, editorChapterId, loadedChapterId }) {
  if (!chapters || chapters.length === 0) return null;
  const target = urlChapterId || work?.currentChapterId || chapters[0]?.id;
  if (!target) return null;
  return target !== editorChapterId || target !== loadedChapterId ? target : null;
}

// Fetches chapters for the Main Room, one at a time. Asking again for the
// chapter already in flight does nothing, and only the newest fetch may report
// back, so a slow reply can't land on top of a later switch or on text the
// writer has typed since.
export function createChapterLoader({ fetchChapter, onLoaded, onError, onLoadingChange }) {
  let ticket = 0;
  let inFlight = null;

  function settle(mine, report) {
    if (mine !== ticket) return;
    inFlight = null;
    report();
    onLoadingChange(null);
  }

  return {
    load(id) {
      if (id === inFlight) return;
      const mine = ++ticket;
      inFlight = id;
      onLoadingChange(id);
      fetchChapter(id).then(
        (chapter) => settle(mine, () => onLoaded(id, chapter)),
        (err) => settle(mine, () => onError(id, err))
      );
    },
    cancel() {
      ticket++;
      if (inFlight === null) return;
      inFlight = null;
      onLoadingChange(null);
    },
  };
}
