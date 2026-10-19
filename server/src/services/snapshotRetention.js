import { DAY_MS } from '../utils/time.js';

// Which automatic snapshots to drop. Pure; named and milestone snapshots are
// never touched, nor are automatic ones with a note ('Before restore'). Buckets are fixed calendar days/weeks (UTC), so a snapshot
// that survives isn't swapped out later just because time moved on.

const WEEK_MS = 7 * DAY_MS;
const DAILY_UNTIL_MS = 30 * DAY_MS;

export function thinSnapshots(snapshots, now) {
  const nowMs = new Date(now).getTime();
  const autos = snapshots
    .filter((s) => s.kind === 'auto' && !s.note)
    .map((s) => ({ id: s.id, t: Date.parse(s.createdAt) }))
    .filter((s) => !Number.isNaN(s.t))
    .sort((a, b) => b.t - a.t);

  const kept = new Set();
  const doomed = [];
  for (const s of autos) {
    const age = nowMs - s.t;
    if (age < DAY_MS) continue;
    const bucket = age < DAILY_UNTIL_MS ? `d${Math.floor(s.t / DAY_MS)}` : `w${Math.floor(s.t / WEEK_MS)}`;
    if (kept.has(bucket)) doomed.push(s.id);
    else kept.add(bucket);
  }
  return doomed;
}
