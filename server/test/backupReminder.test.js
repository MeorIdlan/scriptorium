import { test } from 'node:test';
import assert from 'node:assert/strict';
import Work from '../src/models/Work.js';
import { DAY_MS } from '../src/utils/time.js';
import {
  backupReminderState,
  withBackupReminder,
  REMINDER_DAYS,
  SNOOZE_DAYS,
  SERVER_OWNED_FIELDS,
} from '../src/services/backupReminder.js';

const now = new Date('2026-10-20T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * DAY_MS).toISOString();

// A work created 30 days ago and edited long after, unless a case overrides it
const work = (fields) => ({
  createdAt: daysAgo(30),
  updatedAt: daysAgo(30),
  ...fields,
});

test('a backup that covers the latest change is not due', () => {
  const state = backupReminderState(
    work({ lastBackupAt: daysAgo(10), contentChangedAt: daysAgo(11) }),
    now
  );
  assert.equal(state.due, false);
});

test('a change less than seven days after the last backup is not due', () => {
  const state = backupReminderState(
    work({ lastBackupAt: daysAgo(6 + 23 / 24), contentChangedAt: daysAgo(1) }),
    now
  );
  assert.equal(state.due, false);
});

test('a change unbacked for exactly seven days is due, with the backup age', () => {
  const lastBackupAt = daysAgo(7);
  const state = backupReminderState(
    work({ lastBackupAt, contentChangedAt: daysAgo(1) }),
    now
  );
  assert.equal(state.due, true);
  assert.equal(state.daysSinceBackup, 7);
  assert.equal(state.lastBackupAt, lastBackupAt);
});

test('a never-backed-up work is due once its creation is seven days old', () => {
  const state = backupReminderState(
    work({ createdAt: daysAgo(8), updatedAt: daysAgo(2), contentChangedAt: daysAgo(2) }),
    now
  );
  assert.equal(state.due, true);
  assert.equal(state.lastBackupAt, null);
  assert.equal(state.daysSinceBackup, null);
});

test('a new work that was never changed is not due', () => {
  const createdAt = daysAgo(8);
  const state = backupReminderState(work({ createdAt, updatedAt: createdAt }), now);
  assert.equal(state.due, false);
});

test('without contentChangedAt, an edited work falls back to updatedAt', () => {
  const state = backupReminderState(
    work({ createdAt: daysAgo(20), updatedAt: daysAgo(2) }),
    now
  );
  assert.equal(state.due, true);
});

test('a snoozed reminder is hidden until snoozedUntil passes', () => {
  const dueWork = {
    createdAt: daysAgo(8),
    updatedAt: daysAgo(2),
    contentChangedAt: daysAgo(2),
  };
  const snoozed = backupReminderState(
    { ...dueWork, reminderState: { snoozedUntil: daysAgo(-1) } },
    now
  );
  assert.equal(snoozed.due, false);

  const expired = backupReminderState(
    { ...dueWork, reminderState: { snoozedUntil: daysAgo(1 / 24) } },
    now
  );
  assert.equal(expired.due, true);
});

test('a dismissed reminder restarts the seven-day clock from dismissedAt', () => {
  const state = backupReminderState(
    work({
      lastBackupAt: daysAgo(20),
      contentChangedAt: daysAgo(1),
      reminderState: { dismissedAt: daysAgo(3) },
    }),
    now
  );
  assert.equal(state.due, false);
});

test('a dismissed reminder comes back seven days later if there are still changes', () => {
  const state = backupReminderState(
    work({
      lastBackupAt: daysAgo(20),
      contentChangedAt: daysAgo(1),
      reminderState: { dismissedAt: daysAgo(8) },
    }),
    now
  );
  assert.equal(state.due, true);
});

test('no reminder when the last change is already covered by a backup', () => {
  const state = backupReminderState(
    work({
      lastBackupAt: daysAgo(20),
      contentChangedAt: daysAgo(21),
      reminderState: { dismissedAt: daysAgo(8) },
    }),
    now
  );
  assert.equal(state.due, false);
});

test('withBackupReminder returns the JSON shape with id and the reminder result', () => {
  const doc = new Work({
    _id: 'work_a',
    ownerId: 'user_a',
    title: 'Glass Orchard',
    createdAt: daysAgo(8),
    updatedAt: daysAgo(2),
    contentChangedAt: daysAgo(2),
  });
  const json = withBackupReminder(doc, now);
  assert.equal(json.id, 'work_a');
  assert.equal('_id' in json, false);
  assert.equal(json.title, 'Glass Orchard');
  assert.deepEqual(json.backupReminder, {
    due: true,
    lastBackupAt: null,
    daysSinceBackup: null,
  });
});

test('the Work reminder fields store values and default to absent', () => {
  const bare = new Work({ _id: 'work_b', ownerId: 'user_a', title: 'Bare' });
  assert.equal(bare.lastBackupAt, undefined);
  assert.equal(bare.contentChangedAt, undefined);
  assert.equal(bare.reminderState, undefined);

  const set = new Work({
    _id: 'work_c',
    ownerId: 'user_a',
    title: 'Set',
    lastBackupAt: daysAgo(1),
    contentChangedAt: daysAgo(0),
    reminderState: { snoozedUntil: daysAgo(-3) },
  });
  assert.equal(set.lastBackupAt, daysAgo(1));
  assert.equal(set.contentChangedAt, daysAgo(0));
  assert.equal(set.reminderState.snoozedUntil, daysAgo(-3));
});

test('the constants and server-owned field list are exported', () => {
  assert.equal(REMINDER_DAYS, 7);
  assert.equal(SNOOZE_DAYS, 3);
  assert.deepEqual(SERVER_OWNED_FIELDS, [
    'lastBackupAt',
    'contentChangedAt',
    'reminderState',
    'backupReminder',
  ]);
});
