const MAX_GOAL = 100000;

// The browser's IANA timezone, sent as X-Timezone so the server keys days by the writer's local midnight
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Words typed in this chapter since its last successful save
export function pendingGain(currentWords, savedWords) {
  return Math.max(0, currentWords - savedWords);
}

export function progressView({ words, goal, pendingGain }) {
  if (words === null) return null;
  const total = words + pendingGain;
  const fmt = (n) => n.toLocaleString('en-US');
  if (goal === null) {
    return { total, goal: null, percent: null, text: `Today ${fmt(total)} words` };
  }
  return {
    total,
    goal,
    percent: Math.min(100, Math.round((total / goal) * 100)),
    text: `Today ${fmt(total)} / ${fmt(goal)} words`,
  };
}

const REFUSED = 'Enter a whole number from 1 to 100000, or leave it empty to clear the goal.';

export function parseGoalInput(text) {
  const trimmed = String(text).trim();
  if (trimmed === '') return { ok: true, goal: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: REFUSED };
  const goal = Number(trimmed);
  if (goal < 1 || goal > MAX_GOAL) return { ok: false, message: REFUSED };
  return { ok: true, goal };
}
