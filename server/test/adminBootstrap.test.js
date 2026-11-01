import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import { promoteAdminEmail } from '../src/services/adminBootstrap.js';
import { startDb, clearDb } from './support/http.js';

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});

const addUser = (id, email, extra = {}) =>
  User.create({ _id: id, email, name: id, emailVerified: true, isAdmin: false, createdAt: new Date().toISOString(), ...extra });
const isAdmin = async (id) => (await User.findById(id)).isAdmin;

test('a verified account created before the flag existed is promoted to admin (D1)', async () => {
  await addUser('user_old', 'writer@example.com');

  const promoted = await promoteAdminEmail('writer@example.com');

  assert.equal(promoted, 1);
  assert.equal(await isAdmin('user_old'), true);
});

test('the email match ignores case, as registration does', async () => {
  await addUser('user_old', 'writer@example.com');

  assert.equal(await promoteAdminEmail('Writer@Example.COM'), 1);
  assert.equal(await isAdmin('user_old'), true);
});

test('an unverified account with that email is not promoted', async () => {
  await addUser('user_pending', 'writer@example.com', { emailVerified: false });

  assert.equal(await promoteAdminEmail('writer@example.com'), 0);
  assert.equal(await isAdmin('user_pending'), false);
});

test('other accounts, including plus-address variants, are never promoted', async () => {
  await addUser('user_old', 'writer@example.com');
  await addUser('user_plus', 'writer+test@example.com');
  await addUser('user_other', 'someone@example.com');

  await promoteAdminEmail('writer@example.com');

  assert.equal(await isAdmin('user_plus'), false);
  assert.equal(await isAdmin('user_other'), false);
});

test('promoting only adds: existing admins stay admin when ADMIN_EMAIL points elsewhere', async () => {
  await addUser('user_admin', 'admin@example.com', { isAdmin: true });
  await addUser('user_old', 'writer@example.com');

  await promoteAdminEmail('writer@example.com');

  assert.equal(await isAdmin('user_admin'), true);
});

test('a missing, empty or blank ADMIN_EMAIL promotes nobody', async () => {
  await addUser('user_old', 'writer@example.com');

  assert.equal(await promoteAdminEmail(undefined), 0);
  assert.equal(await promoteAdminEmail(''), 0);
  assert.equal(await promoteAdminEmail('   '), 0);
  assert.equal(await isAdmin('user_old'), false);
});

test('running it again changes nothing', async () => {
  await addUser('user_old', 'writer@example.com');

  assert.equal(await promoteAdminEmail('writer@example.com'), 1);
  assert.equal(await promoteAdminEmail('writer@example.com'), 0);
  assert.equal(await isAdmin('user_old'), true);
});

test('with no argument it reads ADMIN_EMAIL from the environment', async () => {
  await addUser('user_old', 'writer@example.com');
  const saved = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'writer@example.com';
  try {
    assert.equal(await promoteAdminEmail(), 1);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = saved;
  }
  assert.equal(await isAdmin('user_old'), true);
});
