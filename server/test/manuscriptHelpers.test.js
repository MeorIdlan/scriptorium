import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundWordCount,
  formatWordCount,
  defaultSurname,
  headerText,
  resolveManuscriptDetails,
} from '../src/services/manuscriptExport.js';

test('roundWordCount: nearest 100 under 10k, nearest 1,000 from 10k, floor 100', () => {
  for (const [n, want] of [[0,100],[99,100],[4949,4900],[4950,5000],[9999,10000],[10000,10000],[87499,87000],[87500,88000]])
    assert.equal(roundWordCount(n), want, `n=${n}`);
});

test('formatWordCount', () => assert.equal(formatWordCount(87420), 'about 87,000 words'));

test('defaultSurname', () => {
  assert.equal(defaultSurname('J. Q. Ward'), 'Ward');
  assert.equal(defaultSurname('  Ward  '), 'Ward');
  assert.equal(defaultSurname(''), '');
});

test('headerText capitalises the header title', () =>
  assert.equal(headerText({ surname: 'Ward', headerTitle: 'Glass Orchard' }, 2), 'Ward / GLASS ORCHARD / 2'));

test('resolveManuscriptDetails with no settings and no override uses the user name', () => {
  const details = resolveManuscriptDetails({
    settings: undefined,
    work: { title: 'Glass Orchard' },
    userName: 'Jane Q Ward',
  });
  assert.deepEqual(details, {
    authorName: 'Jane Q Ward',
    surname: 'Ward',
    contactBlock: '',
    headerTitle: 'Glass Orchard',
    font: 'serif',
    workOnly: false,
  });
});

test('resolveManuscriptDetails uses the writer defaults from settings', () => {
  const details = resolveManuscriptDetails({
    settings: { authorName: 'J. Q. Ward', contactBlock: 'Jane\njane@x', font: 'mono' },
    work: { title: 'Glass Orchard' },
    userName: 'Jane Q Ward',
  });
  assert.equal(details.authorName, 'J. Q. Ward');
  assert.equal(details.surname, 'Ward');
  assert.equal(details.contactBlock, 'Jane\njane@x');
  assert.equal(details.font, 'mono');
  assert.equal(details.workOnly, false);
});

test('resolveManuscriptDetails: an override is used whole, blank contact block stays blank', () => {
  const details = resolveManuscriptDetails({
    settings: { authorName: 'J. Q. Ward', surname: 'Ward', contactBlock: 'Jane\njane@x', font: 'serif' },
    work: {
      title: 'Glass Orchard',
      manuscript: { override: { authorName: 'Pen Name', surname: '', contactBlock: '' } },
    },
    userName: 'Jane Q Ward',
  });
  assert.equal(details.authorName, 'Pen Name');
  assert.equal(details.surname, 'Name');
  assert.equal(details.contactBlock, '');
  assert.equal(details.workOnly, true);
});

test('resolveManuscriptDetails: work header title wins, font still comes from settings', () => {
  const details = resolveManuscriptDetails({
    settings: { authorName: 'J. Q. Ward', font: 'mono' },
    work: {
      title: 'Glass Orchard',
      manuscript: { headerTitle: 'Orchard', override: { authorName: 'Pen Name', surname: 'Pen', contactBlock: '' } },
    },
    userName: 'Jane Q Ward',
  });
  assert.equal(details.headerTitle, 'Orchard');
  assert.equal(details.font, 'mono');
});
