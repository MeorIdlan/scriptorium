export const SUMMARY_STATUS_LABELS = {
  none: 'No summary yet',
  current: 'Up to date',
  outdated: 'Outdated — refreshes on next AI use',
  edited: 'Edited by you',
  'edited-outdated': 'Edited by you; chapter changed since',
};

// True when an AI call would have to (re)make summaries first, so the UI
// can say why it's slower
export function summaryRefreshPending(chapters, chapterId, scope) {
  const list = chapters || [];
  const current = list.find((c) => c.id === chapterId);
  const targets =
    scope === 'all' ? list : current ? list.filter((c) => c.order < current.order) : [];
  return targets.some(
    (c) => (c.wordCount || 0) > 0 && (c.summaryStatus === 'none' || c.summaryStatus === 'outdated')
  );
}

export function loadingLabel(pending) {
  return pending ? 'Thinking… (updating chapter summaries)' : 'Thinking…';
}
