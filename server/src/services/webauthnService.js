import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import Credential from '../models/Credential.js';
import WebauthnChallenge from '../models/WebauthnChallenge.js';
import User from '../models/User.js';
import { httpError } from '../middleware/errorHandler.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

function rpId() {
  return process.env.WEBAUTHN_RP_ID || 'localhost';
}
function rpName() {
  return process.env.WEBAUTHN_RP_NAME || 'Scriptorium';
}
function origin() {
  return process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
}

export async function registrationOptions(userId, email) {
  const creds = await Credential.find({ userId });
  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpId(),
    userName: email,
    attestationType: 'none',
    excludeCredentials: creds.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await WebauthnChallenge.findOneAndUpdate(
    { userId, type: 'registration' },
    { challenge: options.challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    { upsert: true }
  );
  return options;
}

export async function verifyRegistration(userId, response, deviceLabel) {
  const challengeDoc = await WebauthnChallenge.findOne({
    userId,
    type: 'registration',
    expiresAt: { $gt: new Date() },
  });
  if (!challengeDoc) throw httpError(400, 'NO_CHALLENGE', 'No pending passkey challenge.');

  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: origin(),
    expectedRPID: rpId(),
  });
  if (!result.verified || !result.registrationInfo) {
    throw httpError(401, 'VERIFICATION_FAILED', 'Passkey verification failed.');
  }

  const { credential } = result.registrationInfo;
  const created = await Credential.create({
    _id: `cred_${shortId()}`,
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    deviceLabel,
    createdAt: new Date().toISOString(),
  });
  await challengeDoc.deleteOne();
  return created;
}

export async function authenticationOptions(email) {
  const user = await User.findOne({ email: email.toLowerCase(), emailVerified: true });
  if (!user) throw httpError(404, 'NOT_FOUND', 'No account for this email.');

  const creds = await Credential.find({ userId: user._id });
  if (creds.length === 0) {
    throw httpError(404, 'NO_PASSKEYS', 'No passkeys registered. Use account recovery.');
  }

  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({ id: c.credentialId })),
  });
  const doc = await WebauthnChallenge.create({
    challenge: options.challenge,
    userId: user._id,
    type: 'authentication',
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return { challengeId: doc._id.toString(), options };
}

export async function verifyAuthentication(challengeId, response) {
  let challengeDoc;
  try {
    challengeDoc = await WebauthnChallenge.findOne({
      _id: challengeId,
      type: 'authentication',
      expiresAt: { $gt: new Date() },
    });
  } catch {
    challengeDoc = null;
  }
  if (!challengeDoc) throw httpError(401, 'CHALLENGE_EXPIRED', 'Login challenge expired.');

  const cred = await Credential.findOne({ credentialId: response.id, userId: challengeDoc.userId });
  if (!cred) throw httpError(401, 'UNKNOWN_PASSKEY', 'Unknown passkey.');

  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: origin(),
    expectedRPID: rpId(),
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
    },
  });
  if (!result.verified) throw httpError(401, 'VERIFICATION_FAILED', 'Passkey verification failed.');

  cred.counter = result.authenticationInfo.newCounter;
  await cred.save();
  await challengeDoc.deleteOne();
  return challengeDoc.userId;
}

export async function listCredentials(userId) {
  const creds = await Credential.find({ userId }).sort({ createdAt: 1 });
  return creds.map((c) => ({ id: c._id, deviceLabel: c.deviceLabel, createdAt: c.createdAt }));
}

export async function deleteCredential(userId, credentialDocId) {
  const count = await Credential.countDocuments({ userId });
  const cred = await Credential.findOne({ _id: credentialDocId, userId });
  if (!cred) throw httpError(404, 'NOT_FOUND', 'Passkey not found.');
  if (count <= 1) throw httpError(409, 'LAST_PASSKEY', 'Cannot remove your last passkey.');
  await cred.deleteOne();
}
