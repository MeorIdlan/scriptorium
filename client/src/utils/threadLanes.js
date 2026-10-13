// Where each plot thread runs across the book. A chapter is "touched" by a
// thread when the chapter itself or any of its scenes is tagged with it.

export function touches(thread, chapters) {
  return (chapters || []).map((chapter) => {
    const sceneIndexes = [];
    (chapter?.scenes || []).forEach((scene, i) => {
      if (scene?.threadIds?.includes(thread.id)) sceneIndexes.push(i);
    });
    const tagged = !!chapter?.threadIds?.includes(thread.id);
    return { touched: tagged || sceneIndexes.length > 0, sceneIndexes };
  });
}

// A thread is "dropped" after this many untouched chapters in a row: a fifth
// of the book, but never fewer than three
export function gapThreshold(chapterCount) {
  return Math.max(3, Math.ceil(chapterCount * 0.2));
}

// Runs of untouched chapters at least `threshold` long, start and end inclusive.
// The run after the last touch counts, so does one at the very start.
export function findGaps(touchedFlags, threshold) {
  const gaps = [];
  let start = null;
  const close = (end) => {
    if (start !== null && end - start + 1 >= threshold) gaps.push({ start, end, length: end - start + 1 });
    start = null;
  };
  touchedFlags.forEach((touched, i) => {
    if (touched) close(i - 1);
    else if (start === null) start = i;
  });
  close(touchedFlags.length - 1);
  return gaps;
}

// Resolved threads are finished, so they are never "dropped". An open thread
// that no chapter touches is one full-length gap, however short the book is.
export function laneGaps(thread, chapters) {
  if (thread.status === 'resolved') return [];
  const flags = touches(thread, chapters).map((t) => t.touched);
  if (flags.length > 0 && !flags.includes(true)) return [{ start: 0, end: flags.length - 1, length: flags.length }];
  return findGaps(flags, gapThreshold(flags.length));
}

// Open threads that are not touched in the final chapter, with the index of the
// last chapter that touched them (null when none did)
export function openAtEnd(threads, chapters) {
  const list = chapters || [];
  if (list.length === 0) return [];
  const result = [];
  for (const thread of threads || []) {
    if (thread.status === 'resolved') continue;
    const flags = touches(thread, list).map((t) => t.touched);
    if (flags[flags.length - 1]) continue;
    const lastChapter = flags.lastIndexOf(true);
    result.push({ thread, lastChapter: lastChapter === -1 ? null : lastChapter });
  }
  return result;
}
