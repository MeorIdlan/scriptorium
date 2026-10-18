import Work from '../models/Work.js';
import User from '../models/User.js';
import { getSettings, saveSettings } from './settingsService.js';
import { resolveManuscriptDetails } from './manuscriptExport.js';
import { httpError } from '../middleware/errorHandler.js';

const MAX_NAME = 200;
const MAX_CONTACT = 1000;
const MAX_CONTACT_LINES = 10;
const FONTS = ['serif', 'mono'];

function invalid(message) {
  return httpError(400, 'VALIDATION_ERROR', message);
}

function plain(work) {
  return typeof work.toObject === 'function' ? work.toObject() : work;
}

// Undefined stays undefined (the field was not sent); anything else must be text
function text(value, field, max) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw invalid(`${field} must be ${max} characters or fewer`);
  return trimmed;
}

function contactText(value) {
  const trimmed = text(value, 'contactBlock', MAX_CONTACT);
  if (trimmed !== undefined && trimmed.split('\n').length > MAX_CONTACT_LINES) {
    throw invalid(`contactBlock must be ${MAX_CONTACT_LINES} lines or fewer`);
  }
  return trimmed;
}

export async function getManuscriptDetails(work, userId) {
  const [settings, user] = await Promise.all([
    getSettings(userId),
    User.findById(userId).select('name').lean(),
  ]);
  return resolveManuscriptDetails({
    settings: settings.manuscript,
    work: plain(work),
    userName: user?.name,
  });
}

// Saves the writer's details for one work. Validates everything before writing,
// so a refused save leaves both the Settings and the Work untouched.
export async function saveManuscriptDetails(work, userId, input) {
  if (input == null) return;
  const current = plain(work);

  const authorName = text(input.authorName, 'authorName', MAX_NAME);
  const surname = text(input.surname, 'surname', MAX_NAME);
  const headerTitle = text(input.headerTitle, 'headerTitle', MAX_NAME);
  const contactBlock = contactText(input.contactBlock);
  const { font } = input;
  if (font !== undefined && !FONTS.includes(font)) throw invalid('font must be serif or mono');
  if (input.workOnly !== undefined && typeof input.workOnly !== 'boolean') {
    throw invalid('workOnly must be true or false');
  }
  const workOnly = input.workOnly ?? Boolean(current.manuscript?.override);

  // The set being written: the existing override, or what the work resolves to
  // when an override is created; the writer's saved defaults otherwise
  let base;
  if (workOnly) {
    base = current.manuscript?.override ?? (await getManuscriptDetails(current, userId));
  } else {
    base = (await getSettings(userId)).manuscript ?? {};
  }

  const merged = {
    authorName: authorName ?? base.authorName ?? '',
    surname: surname ?? base.surname ?? '',
    contactBlock: contactBlock ?? base.contactBlock ?? '',
  };
  if (!merged.authorName) throw invalid('authorName is required');

  const settingsFields = workOnly ? {} : { ...merged };
  if (font !== undefined) settingsFields.font = font;
  if (Object.keys(settingsFields).length) {
    await saveSettings(userId, { manuscript: settingsFields });
  }

  const $set = {};
  const $unset = {};
  if (workOnly) $set['manuscript.override'] = merged;
  else $unset['manuscript.override'] = '';
  if (headerTitle !== undefined) {
    if (headerTitle === '' || headerTitle === (current.title || '').trim()) {
      $unset['manuscript.headerTitle'] = '';
    } else {
      $set['manuscript.headerTitle'] = headerTitle;
    }
  }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  await Work.updateOne({ _id: current._id }, update);
}
