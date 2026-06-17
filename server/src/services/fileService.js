import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR =
  process.env.DATA_DIR ?? path.join(__dirname, '../../data');

export function fullPath(relPath) {
  return path.join(DATA_DIR, relPath);
}

export function readJSON(relPath) {
  const fp = fullPath(relPath);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJSON(relPath, data) {
  const fp = fullPath(relPath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureDir(relPath) {
  const fp = fullPath(relPath);
  fs.mkdirSync(fp, { recursive: true });
}

export function deleteDir(relPath) {
  const fp = fullPath(relPath);
  if (fs.existsSync(fp)) {
    fs.rmSync(fp, { recursive: true, force: true });
  }
}

export function exists(relPath) {
  return fs.existsSync(fullPath(relPath));
}
