import { Router } from 'express';
import User from '../models/User.js';
import Work from '../models/Work.js';
import Settings from '../models/Settings.js';
import Credential from '../models/Credential.js';
import AuthSession from '../models/AuthSession.js';
import WebauthnChallenge from '../models/WebauthnChallenge.js';
import { deleteWorkCascade } from '../services/workService.js';
import * as auditService from '../services/auditService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return next(httpError(400, 'INVALID_REQUEST', "You can't delete your own account from this page."));
    }

    const target = await User.findById(userId);
    if (!target) return next(httpError(404, 'NOT_FOUND', 'User not found'));

    if (target.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return next(httpError(400, 'INVALID_REQUEST', 'Cannot delete the only admin account.'));
      }
    }

    const works = await Work.find({ ownerId: userId }).select('_id');
    for (const work of works) {
      await Work.deleteOne({ _id: work._id });
      await deleteWorkCascade(work._id);
    }

    await Promise.all([
      Settings.deleteOne({ _id: userId }),
      Credential.deleteMany({ userId }),
      AuthSession.deleteMany({ userId }),
      WebauthnChallenge.deleteMany({ userId }),
      User.deleteOne({ _id: userId }),
    ]);

    await auditService.log({
      userId: req.user.id,
      action: 'admin.user_deleted',
      metadata: { deletedUserId: userId, deletedEmail: target.email },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
