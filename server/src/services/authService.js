import User from '../models/User.js';
import * as otpService from './otpService.js';
import * as emailService from './emailService.js';
import * as authSessionService from './authSessionService.js';
import * as auditService from './auditService.js';
import { httpError } from '../middleware/errorHandler.js';

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

export async function startRegistration(name, email) {
  const normalized = email.toLowerCase();
  const existing = await User.findOne({ email: normalized });
  if (existing?.emailVerified) {
    throw httpError(409, 'ALREADY_EXISTS', 'Account already exists. Log in instead.');
  }

  const user =
    existing ||
    (await User.create({
      _id: `user_${shortId()}`,
      email: normalized,
      name,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    }));
  if (existing && existing.name !== name) {
    existing.name = name;
    await existing.save();
  }

  const code = await otpService.issue(normalized, 'register');
  await emailService.sendRegistrationRequestEmail(process.env.ADMIN_EMAIL, code, { name, email: normalized });
  await auditService.log({ userId: user._id, action: 'auth.otp_requested', metadata: { purpose: 'register', name } });
}

export async function startRecovery(email) {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized, emailVerified: true });
  if (!user) throw httpError(404, 'NOT_FOUND', 'No account for this email.');

  const code = await otpService.issue(normalized, 'recovery');
  await emailService.sendOtpEmail(normalized, code);
  await auditService.log({ userId: user._id, action: 'auth.recovery_started' });
}

export async function verifyOtp(email, code, purpose) {
  const normalized = email.toLowerCase();
  const ok = await otpService.verify(normalized, purpose, code);
  if (!ok) throw httpError(401, 'INVALID_CODE', 'Invalid or expired code.');

  const user = await User.findOne({ email: normalized });
  if (!user) throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');

  if (purpose === 'register' && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
    await auditService.log({ userId: user._id, action: 'auth.registered' });
  }
  if (purpose === 'recovery' && !user.emailVerified) {
    throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  return authSessionService.create(user._id, 'pending_passkey');
}
