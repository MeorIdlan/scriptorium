// Test helper: runs the epubcheck jar on an EPUB buffer. EPUBCHECK_JAR is the path to
// the jar and JAVA an optional java binary. CI does not install epubcheck, so the tests
// that use it are skipped when HAS_EPUBCHECK is false.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HAS_EPUBCHECK = Boolean(process.env.EPUBCHECK_JAR);

export function epubcheck(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epubcheck-'));
  const file = path.join(dir, 'book.epub');
  try {
    fs.writeFileSync(file, buffer);
    const run = spawnSync(process.env.JAVA || 'java', ['-jar', process.env.EPUBCHECK_JAR, file], { encoding: 'utf8' });
    const output = [run.stdout, run.stderr, run.error?.message].filter(Boolean).join('');
    return { ok: run.status === 0, output };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
