// Runs the ops/backup shell scripts against a stub `docker` on PATH, so the
// dump, prune and restore-check logic is tested without a real MongoDB.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ops/backup');
const DAY = 24 * 60 * 60 * 1000;
const ARCHIVE_RE = /^scriptorium-\d{8}T\d{6}Z\.archive\.gz$/;

// The stub logs every call and answers by subcommand. STUB_MODE switches
// mongodump between a normal archive, a failure and empty output.
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$STUB_MODE" in
  fail) echo "mongodump: connection refused" >&2; exit 1 ;;
  empty) exit 0 ;;
  *) printf 'FAKEARCHIVE' ;;
esac
`;

let tmp, bin, backupDir, stubLog;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  bin = path.join(tmp, 'bin');
  backupDir = path.join(tmp, 'backups');
  stubLog = path.join(tmp, 'docker.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), STUB, { mode: 0o755 });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function run(script, env = {}, args = []) {
  return spawnSync('bash', [path.join(OPS, script), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_DIR: backupDir,
      STUB_LOG: stubLog,
      ...env,
    },
  });
}

function seed(name, ageDays) {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, name);
  fs.writeFileSync(file, 'OLD');
  const t = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(file, t, t);
  return file;
}

const archives = () => fs.readdirSync(backupDir).filter((f) => ARCHIVE_RE.test(f));
const mode = (p) => fs.statSync(p).mode & 0o777;

test('dump writes a timestamped gzip archive readable only by its owner', () => {
  const r = run('mongo-dump.sh');
  assert.equal(r.status, 0, r.stderr);
  const files = archives();
  assert.equal(files.length, 1);
  const file = path.join(backupDir, files[0]);
  assert.equal(fs.readFileSync(file, 'utf8'), 'FAKEARCHIVE');
  assert.equal(mode(file), 0o600);
  assert.equal(mode(backupDir), 0o700);
  assert.deepEqual(fs.readdirSync(backupDir), files, 'no .tmp file left behind');
  assert.match(fs.readFileSync(stubLog, 'utf8'), /^exec mongo-mongo-1 mongodump --db scriptorium --archive --gzip$/m);
});

test('dump honours MONGO_CONTAINER and DB overrides', () => {
  const r = run('mongo-dump.sh', { MONGO_CONTAINER: 'other-mongo', DB: 'otherdb' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(stubLog, 'utf8'), /^exec other-mongo mongodump --db otherdb --archive --gzip$/m);
  assert.equal(fs.readdirSync(backupDir).filter((f) => /^otherdb-.*\.archive\.gz$/.test(f)).length, 1);
});

for (const [stubMode, why] of [['fail', 'mongodump fails'], ['empty', 'mongodump writes nothing']]) {
  test(`dump exits non-zero, writes nothing and prunes nothing when ${why}`, () => {
    const old = seed('scriptorium-20260901T033000Z.archive.gz', 40);
    const r = run('mongo-dump.sh', { STUB_MODE: stubMode });
    assert.notEqual(r.status, 0);
    assert.deepEqual(fs.readdirSync(backupDir), [path.basename(old)]);
  });
}

test('a successful dump prunes only its own archives older than the retention', () => {
  const stale = seed('scriptorium-20260930T033000Z.archive.gz', 8);
  const recent = seed('scriptorium-20261005T033000Z.archive.gz', 6);
  const unrelated = seed('notes.txt', 30);
  const otherDb = seed('tender-20260901T033000Z.archive.gz', 30);
  const r = run('mongo-dump.sh');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(stale), false);
  for (const kept of [recent, unrelated, otherDb]) assert.equal(fs.existsSync(kept), true, kept);
  assert.equal(archives().length, 2);
});

test('RETENTION_DAYS changes how long archives are kept', () => {
  const twoDays = seed('scriptorium-20261009T033000Z.archive.gz', 2);
  const r = run('mongo-dump.sh', { RETENTION_DAYS: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(twoDays), false);
});
