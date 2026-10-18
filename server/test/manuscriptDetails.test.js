import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import Settings from '../src/models/Settings.js';
import Work from '../src/models/Work.js';
import User from '../src/models/User.js';
import { getManuscriptDetails, saveManuscriptDetails } from '../src/services/manuscriptDetails.js';

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  await User.create({ _id: 'user_a', email: 'a@example.com', name: 'Ada Writer' });
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Glass Orchard' });
  await Work.create({ _id: 'work_b', ownerId: 'user_a', title: 'Second Book' });
});

// loadWork hands the routes a Mongoose document, so the tests do the same
const work = (id = 'work_a') => Work.findById(id);

const writerDefaults = {
  authorName: 'Ada Q. Writer',
  surname: 'Writer',
  contactBlock: 'Ada Writer\n12 Quay Street',
  font: 'serif',
};

test('a work that never had an override resolves to the writer defaults (workOnly false)', async () => {
  const details = await getManuscriptDetails(await work(), 'user_a');
  assert.deepEqual(details, {
    authorName: 'Ada Writer',
    surname: 'Writer',
    contactBlock: '',
    headerTitle: 'Glass Orchard',
    font: 'serif',
    workOnly: false,
  });
});

test('workOnly false writes the writer defaults, read back for another work', async () => {
  await saveManuscriptDetails(await work('work_a'), 'user_a', {
    ...writerDefaults,
    font: 'mono',
    workOnly: false,
  });

  const details = await getManuscriptDetails(await work('work_b'), 'user_a');
  assert.equal(details.authorName, 'Ada Q. Writer');
  assert.equal(details.surname, 'Writer');
  assert.equal(details.contactBlock, 'Ada Writer\n12 Quay Street');
  assert.equal(details.font, 'mono');
  assert.equal(details.workOnly, false);
});

test('workOnly true writes only this work override; another work keeps the writer defaults', async () => {
  await saveManuscriptDetails(await work('work_b'), 'user_a', writerDefaults);
  await saveManuscriptDetails(await work('work_a'), 'user_a', {
    authorName: 'Pen Name',
    surname: 'Name',
    contactBlock: 'Pen Box',
    workOnly: true,
  });

  const first = await getManuscriptDetails(await work('work_a'), 'user_a');
  assert.equal(first.workOnly, true);
  assert.equal(first.authorName, 'Pen Name');
  assert.equal(first.contactBlock, 'Pen Box');

  const second = await getManuscriptDetails(await work('work_b'), 'user_a');
  assert.equal(second.workOnly, false);
  assert.equal(second.authorName, 'Ada Q. Writer');
});

test('workOnly false on an overridden work clears its override', async () => {
  await saveManuscriptDetails(await work(), 'user_a', { authorName: 'Pen', workOnly: true });
  assert.ok((await Work.findById('work_a').lean()).manuscript.override);

  await saveManuscriptDetails(await work(), 'user_a', { ...writerDefaults, workOnly: false });
  const stored = await Work.findById('work_a').lean();
  assert.equal(stored.manuscript.override, undefined);
  assert.equal((await getManuscriptDetails(await work(), 'user_a')).workOnly, false);
});

test('an absent workOnly keeps the work in its current mode', async () => {
  await saveManuscriptDetails(await work(), 'user_a', { authorName: 'Pen', workOnly: true });
  await saveManuscriptDetails(await work(), 'user_a', { authorName: 'Pen Two' });

  const details = await getManuscriptDetails(await work(), 'user_a');
  assert.equal(details.workOnly, true);
  assert.equal(details.authorName, 'Pen Two');
});

test('a partial input keeps the saved contact block', async () => {
  await saveManuscriptDetails(await work(), 'user_a', { ...writerDefaults, workOnly: false });
  await saveManuscriptDetails(await work(), 'user_a', { authorName: 'New' });

  const settings = await Settings.findById('user_a').lean();
  assert.equal(settings.manuscript.authorName, 'New');
  assert.equal(settings.manuscript.contactBlock, 'Ada Writer\n12 Quay Street');
});

test('an undefined input writes nothing', async () => {
  await saveManuscriptDetails(await work(), 'user_a', undefined);

  assert.equal(await Settings.findById('user_a').lean(), null);
  const stored = await Work.findById('work_a').lean();
  assert.equal(stored.manuscript, undefined);
});

test('creating an override copies the currently resolved contact block', async () => {
  await saveManuscriptDetails(await work('work_b'), 'user_a', { ...writerDefaults, workOnly: false });
  await saveManuscriptDetails(await work('work_a'), 'user_a', { authorName: 'Pen', workOnly: true });

  const stored = await Work.findById('work_a').lean();
  assert.deepEqual(stored.manuscript.override, {
    authorName: 'Pen',
    surname: 'Writer',
    contactBlock: 'Ada Writer\n12 Quay Street',
  });
});

test('a headerTitle equal to the work title, or empty, leaves headerTitle unset', async () => {
  await saveManuscriptDetails(await work(), 'user_a', {
    ...writerDefaults,
    headerTitle: 'Glass Orchard',
    workOnly: false,
  });
  assert.equal((await Work.findById('work_a').lean()).manuscript?.headerTitle, undefined);

  await saveManuscriptDetails(await work(), 'user_a', { headerTitle: 'GLASS' });
  assert.equal((await Work.findById('work_a').lean()).manuscript.headerTitle, 'GLASS');

  await saveManuscriptDetails(await work(), 'user_a', { headerTitle: '' });
  assert.equal((await Work.findById('work_a').lean()).manuscript.headerTitle, undefined);
});

test('a header title equal to a work title longer than 200 characters is saved as unset', async () => {
  const longTitle = 'T'.repeat(250);
  await Work.updateOne({ _id: 'work_a' }, { title: longTitle });

  await saveManuscriptDetails(await work(), 'user_a', {
    ...writerDefaults,
    headerTitle: longTitle,
    workOnly: false,
  });
  assert.equal((await Work.findById('work_a').lean()).manuscript?.headerTitle, undefined);
});

test('invalid details are refused and nothing is written', async () => {
  await saveManuscriptDetails(await work(), 'user_a', { ...writerDefaults, workOnly: false });
  const before = {
    settings: await Settings.findById('user_a').lean(),
    work: await Work.findById('work_a').lean(),
  };

  const bad = [
    { authorName: '  ' },
    { surname: 'x'.repeat(201) },
    { contactBlock: Array.from({ length: 11 }, (_, i) => `line ${i}`).join('\n') },
    { contactBlock: 'x'.repeat(1001) },
    { font: 'sans' },
    { workOnly: true, authorName: '' },
  ];
  for (const input of bad) {
    await assert.rejects(
      saveManuscriptDetails(await work(), 'user_a', input),
      (err) => err.status === 400 && err.code === 'VALIDATION_ERROR',
      `input ${JSON.stringify(input).slice(0, 60)} should be refused`
    );
  }

  assert.deepEqual(await Settings.findById('user_a').lean(), before.settings);
  assert.deepEqual(await Work.findById('work_a').lean(), before.work);
});
