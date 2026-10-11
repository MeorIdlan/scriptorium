// Words added/removed between two plain texts. Pure. Matches paragraphs
// first (cheap), then compares words only inside the paragraphs that changed,
// so a one-word edit counts as one word, not a whole paragraph.

export const MAX_DIFF_CELLS = 4_000_000;

const words = (text) => text.split(/\s+/).filter(Boolean);

function lcsLength(a, b) {
  let prev = new Int32Array(b.length + 1);
  let row = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

function wordStats(before, after, maxCells) {
  const a = words(before);
  const b = words(after);
  if (a.length * b.length > maxCells) return { added: b.length, removed: a.length };
  const common = lcsLength(a, b);
  return { added: b.length - common, removed: a.length - common };
}

export function diffStats(before, after, { maxCells = MAX_DIFF_CELLS } = {}) {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const am = a.slice(prefix, a.length - suffix);
  const bm = b.slice(prefix, b.length - suffix);

  // Too many paragraphs to align: compare the whole changed stretch as one run
  if (am.length * bm.length > maxCells) return wordStats(am.join('\n'), bm.join('\n'), maxCells);

  const dp = Array.from({ length: am.length + 1 }, () => new Int32Array(bm.length + 1));
  for (let i = am.length - 1; i >= 0; i--) {
    for (let j = bm.length - 1; j >= 0; j--) {
      dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let added = 0;
  let removed = 0;
  let runA = [];
  let runB = [];
  const flush = () => {
    if (!runA.length && !runB.length) return;
    const stats = wordStats(runA.join('\n'), runB.join('\n'), maxCells);
    added += stats.added;
    removed += stats.removed;
    runA = [];
    runB = [];
  };
  let i = 0;
  let j = 0;
  while (i < am.length || j < bm.length) {
    if (i < am.length && j < bm.length && am[i] === bm[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (j < bm.length && (i >= am.length || dp[i][j + 1] >= dp[i + 1][j])) {
      runB.push(bm[j]);
      j += 1;
    } else {
      runA.push(am[i]);
      i += 1;
    }
  }
  flush();
  return { added, removed };
}
