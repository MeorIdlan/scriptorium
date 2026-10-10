import User from '../models/User.js';

// Local-only auth bypass: every request is treated as this user.
// Never active when NODE_ENV is production, whatever the flag says.
export const DEV_USER = {
  _id: 'user_dev',
  email: 'dev@localhost',
  name: 'Dev',
};

export function isBypassEnabled() {
  return process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

export async function ensureDevUser() {
  await User.updateOne(
    { _id: DEV_USER._id },
    {
      $set: { email: DEV_USER.email, name: DEV_USER.name, emailVerified: true, isAdmin: true },
      $setOnInsert: { createdAt: new Date().toISOString() },
    },
    { upsert: true }
  );
}
