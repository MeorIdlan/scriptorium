import { Router } from 'express';
import { httpError } from '../middleware/errorHandler.js';
import {
  dayKeyForRequest,
  getDailyWords,
  getDailyGoal,
  setDailyGoal,
  isValidGoal,
} from '../services/progressService.js';

const router = Router();

// GET /api/progress/today
router.get('/today', async (req, res, next) => {
  try {
    const date = dayKeyForRequest(req);
    const [words, goal] = await Promise.all([getDailyWords(req.user.id, date), getDailyGoal(req.user.id)]);
    res.json({ date, words, goal });
  } catch (err) {
    next(err);
  }
});

// PUT /api/progress/goal
router.put('/goal', async (req, res, next) => {
  try {
    const { goal } = req.body || {};
    if (!isValidGoal(goal)) {
      return next(httpError(400, 'INVALID_GOAL', 'Daily goal must be a whole number from 1 to 100000, or empty to clear it'));
    }
    res.json({ goal: await setDailyGoal(req.user.id, goal) });
  } catch (err) {
    next(err);
  }
});

export default router;
