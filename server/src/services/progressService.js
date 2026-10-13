import DailyProgress from '../models/DailyProgress.js';
import Settings from '../models/Settings.js';
import { dayKey } from './wordCountService.js';

const FALLBACK_ZONE = 'UTC';

// The writer's current day, from the X-Timezone header. A missing or unknown zone uses UTC and never fails a request.
export function dayKeyForRequest(req, now = new Date()) {
  const zone = req.get('X-Timezone') || FALLBACK_ZONE;
  try {
    return dayKey(now, zone);
  } catch (err) {
    if (err instanceof RangeError) return dayKey(now, FALLBACK_ZONE);
    throw err;
  }
}

export async function addDailyWords(userId, date, words) {
  if (!(words > 0)) return;
  await DailyProgress.updateOne(
    { _id: `${userId}_${date}` },
    { $inc: { words }, $set: { userId, date, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function getDailyWords(userId, date) {
  const doc = await DailyProgress.findById(`${userId}_${date}`).lean();
  return doc?.words ?? 0;
}

const MAX_GOAL = 100000;

export function isValidGoal(value) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= MAX_GOAL);
}

export async function getDailyGoal(userId) {
  const settings = await Settings.findById(userId).lean();
  return settings?.dailyWordGoal ?? null;
}

export async function setDailyGoal(userId, goal) {
  await Settings.updateOne(
    { _id: userId },
    { $set: { dailyWordGoal: goal, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  return goal;
}
