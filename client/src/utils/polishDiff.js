// Sentence-level diff for Polish review. Pure; no DOM.

const BOUNDARY = /[.!?…]+["'”’)\]]*\s+|\n\s*/g;
const ABBREVIATIONS = /(?:^|[\s("“])(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Capt|Lt|Col|Gen|Sgt|Mt|vs)$/i;

export function sentenceSpans(text) {
  if (!text) return [];
  const spans = [];
  let last = 0;
  for (const match of text.matchAll(BOUNDARY)) {
    // "Mr. Vell" is one sentence: a lone '.' after a known abbreviation isn't a boundary
    if (match[0].startsWith('.') && /^\.\s/.test(match[0]) && ABBREVIATIONS.test(text.slice(last, match.index))) continue;
    const end = match.index + match[0].length;
    spans.push({ text: text.slice(last, end), start: last, end });
    last = end;
  }
  if (last < text.length) spans.push({ text: text.slice(last), start: last, end: text.length });
  return spans;
}

export function splitSentences(text) {
  return sentenceSpans(text).map((s) => s.text);
}

function lcsTable(a, b, same) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

const sentenceKey = (s) => s.text.trimEnd();

export function diffSentences(original, rewrite) {
  const a = sentenceSpans(original);
  const b = sentenceSpans(rewrite);
  const same = (x, y) => sentenceKey(x) === sentenceKey(y);

  // Match the shared opening and ending first, so repeated identical
  // sentences don't shift the alignment and split one edit into two
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && same(a[prefix], b[prefix])) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    same(a[a.length - 1 - suffix], b[b.length - 1 - suffix])
  ) {
    suffix += 1;
  }
  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);
  const dp = lcsTable(aMid, bMid, same);
  const segments = [];
  let pending = null;

  const flush = () => {
    if (!pending) return;
    const { from, to, at } = pending;
    const start = from.length ? from[0].start : at;
    const end = from.length ? from[from.length - 1].end : start;
    let toText = to.map((s) => s.text).join('');
    // Appending after a final sentence that has no trailing space needs one
    if (!from.length && start === original.length && start > 0 && !/\s$/.test(original) && toText && !/^\s/.test(toText)) {
      toText = ` ${toText}`;
    }
    segments.push({ type: 'change', fromText: original.slice(start, end), toText, start, end });
    pending = null;
  };
  const equal = (span) => segments.push({ type: 'equal', text: span.text, start: span.start, end: span.end });
  const open = (i) =>
    (pending ??= { from: [], to: [], at: i < aMid.length ? aMid[i].start : a[prefix + aMid.length]?.start ?? original.length });

  a.slice(0, prefix).forEach(equal);
  let i = 0;
  let j = 0;
  while (i < aMid.length || j < bMid.length) {
    if (i < aMid.length && j < bMid.length && same(aMid[i], bMid[j])) {
      flush();
      equal(aMid[i]);
      i += 1;
      j += 1;
    } else if (j < bMid.length && (i >= aMid.length || dp[i][j + 1] >= dp[i + 1][j])) {
      open(i).to.push(bMid[j]);
      j += 1;
    } else {
      open(i).from.push(aMid[i]);
      i += 1;
    }
  }
  flush();
  a.slice(a.length - suffix).forEach(equal);
  return segments;
}

const TOKEN = /\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu;

export function diffWords(fromText, toText) {
  const a = fromText.match(TOKEN) || [];
  const b = toText.match(TOKEN) || [];
  const dp = lcsTable(a, b, (x, y) => x === y);
  const raw = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      raw.push({ type: 'add', text: b[j] });
      j += 1;
    } else {
      raw.push({ type: 'del', text: a[i] });
      i += 1;
    }
  }

  // Group each run of edits as one deletion then one addition. A lone
  // whitespace match between two edits belongs to the edit ("walked very" →
  // "strode", not "walked" + " " + "very"), and whitespace both sides end
  // with stays outside it.
  const ops = [];
  const pushSame = (text) => {
    const last = ops[ops.length - 1];
    if (last && last.type === 'same') last.text += text;
    else if (text) ops.push({ type: 'same', text });
  };
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === 'same') {
      pushSame(raw[k].text);
      k += 1;
      continue;
    }
    let del = '';
    let add = '';
    while (k < raw.length) {
      const op = raw[k];
      const bridge = op.type === 'same' && /^\s+$/.test(op.text) && raw[k + 1] && raw[k + 1].type !== 'same';
      if (op.type === 'del') del += op.text;
      else if (op.type === 'add') add += op.text;
      else if (bridge) {
        del += op.text;
        add += op.text;
      } else break;
      k += 1;
    }
    const shared = (del.match(/\s*$/)[0].length && add.endsWith(del.match(/\s*$/)[0])) ? del.match(/\s*$/)[0] : '';
    if (shared) {
      del = del.slice(0, -shared.length);
      add = add.slice(0, -shared.length);
    }
    if (del) ops.push({ type: 'del', text: del });
    if (add) ops.push({ type: 'add', text: add });
    if (shared) pushSame(shared);
  }
  return ops;
}

export function buildChanges(targets, rewrites) {
  const byId = new Map(rewrites.map((r) => [r.id, r.text]));
  const segmentsByTarget = {};
  const changes = [];
  for (const target of targets) {
    const rewrite = byId.get(target.id);
    if (rewrite === undefined || rewrite === target.text) {
      segmentsByTarget[target.id] = [{ type: 'equal', text: target.text }];
      continue;
    }
    let n = 0;
    segmentsByTarget[target.id] = diffSentences(target.text, rewrite).map((seg) => {
      if (seg.type === 'equal') return { type: 'equal', text: seg.text };
      n += 1;
      const id = `${target.id}-c${n}`;
      changes.push({
        id,
        targetId: target.id,
        blockIndex: target.blockIndex,
        start: target.start + seg.start,
        end: target.start + seg.end,
        fromText: seg.fromText,
        toText: seg.toText,
        status: 'pending',
      });
      return { type: 'change', changeId: id };
    });
  }
  return { segmentsByTarget, changes };
}
