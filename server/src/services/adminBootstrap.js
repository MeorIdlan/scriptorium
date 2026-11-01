import User from '../models/User.js';

// `isAdmin` is stored on the user and set when the account is created
// (authService.startRegistration), so an ADMIN_EMAIL account that existed
// before that flag, or before ADMIN_EMAIL named it, would never become admin.
// Run at server start: promote the verified account whose email is ADMIN_EMAIL.
// It only ever promotes. Returns how many accounts it changed.
export async function promoteAdminEmail(adminEmail = process.env.ADMIN_EMAIL) {
  const email = adminEmail?.trim().toLowerCase();
  if (!email) return 0;
  const result = await User.updateMany(
    { email, emailVerified: true, isAdmin: { $ne: true } },
    { $set: { isAdmin: true } }
  );
  return result.modifiedCount;
}
