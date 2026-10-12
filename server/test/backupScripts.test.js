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

// The stub logs every call and answers by the Mongo tool being exec'd.
// mongodump: STUB_MODE switches between an archive, a failure, no output and
// a hang.
// mongorestore: saves stdin to STUB_RESTORED; STUB_RESTORE_MODE=fail fails it.
// mongosh: dropDatabase calls are only logged; any other eval prints
// STUB_COUNTS ("live|restored <collection> <count>" lines), or fails when
// STUB_COUNTS_MODE=fail.
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$*" in
  *mongodump*)
    case "$STUB_MODE" in
      fail) echo "mongodump: connection refused" >&2; exit 1 ;;
      empty) exit 0 ;;
      hang) exec sleep 5 ;;
      *) printf 'FAKEARCHIVE' ;;
    esac ;;
  *mongorestore*)
    cat > "$STUB_RESTORED"
    [ "$STUB_RESTORE_MODE" = fail ] && { echo "mongorestore: bad archive" >&2; exit 1; }
    exit 0 ;;
  *dropDatabase*) exit 0 ;;
  *mongosh*)
    [ "$STUB_COUNTS_MODE" = fail ] && { echo "MongoServerError: not primary" >&2; exit 1; }
    printf '%s\\n' "$STUB_COUNTS" ;;
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

test('pruning leaves archives of a database whose name only starts with DB', () => {
  const sibling = seed('scriptorium-staging-20260901T033000Z.archive.gz', 30);
  const r = run('mongo-dump.sh');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(sibling), true);
});

test('dump refuses a database name that is not a plain identifier', () => {
  const r = run('mongo-dump.sh', { DB: 'x/../etc' });
  assert.notEqual(r.status, 0);
  assert.equal(fs.existsSync(stubLog), false, 'docker never called');
});

test('dump gives up, writes nothing and prunes nothing when mongodump hangs past DUMP_TIMEOUT', () => {
  const old = seed('scriptorium-20260901T033000Z.archive.gz', 40);
  const started = Date.now();
  const r = run('mongo-dump.sh', { STUB_MODE: 'hang', DUMP_TIMEOUT: '1' });
  assert.notEqual(r.status, 0);
  assert.ok(Date.now() - started < 4000, 'did not wait for the hung dump');
  assert.match(r.stdout, /FAILED/);
  assert.deepEqual(fs.readdirSync(backupDir), [path.basename(old)]);
});

test('cron entry runs the installed dump as root at 02:00 Kuala Lumpur time (18:00 UTC) and logs it', () => {
  const cron = fs.readFileSync(path.join(OPS, 'scriptorium-backup.cron'), 'utf8');
  assert.ok(cron.endsWith('\n'), 'cron.d ignores a last line without a newline');
  const jobs = cron.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !/^[A-Z]+=/.test(l));
  assert.deepEqual(jobs, [
    '0 18 * * * root /usr/local/sbin/scriptorium-mongo-dump >> /var/log/scriptorium-backup.log 2>&1',
  ]);
  assert.match(cron, /^PATH=.*\/usr\/bin/m);
});

// --- restore check ---

const MATCHING = [
  'live users 1', 'live works 2', 'live auditlogs 6',
  'restored users 1', 'restored works 2', 'restored auditlogs 6',
].join('\n');

function restore(env = {}, args = []) {
  return run('mongo-restore-check.sh', {
    STUB_RESTORED: path.join(tmp, 'restored'),
    STUB_COUNTS: MATCHING,
    ...env,
  }, args);
}
const calls = () => (fs.existsSync(stubLog) ? fs.readFileSync(stubLog, 'utf8') : '');
const restoredBytes = () => fs.readFileSync(path.join(tmp, 'restored'), 'utf8');
const dropped = () => /dropDatabase/.test(calls());

test('restore check refuses to restore into the source database', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ RESTORE_DB: 'scriptorium' });
  assert.notEqual(r.status, 0);
  assert.equal(calls(), '', 'docker never called');
});

test('restore check restores the newest archive into the throwaway db and passes on matching counts', () => {
  fs.mkdirSync(backupDir);
  fs.writeFileSync(path.join(backupDir, 'scriptorium-20261009T033000Z.archive.gz'), 'OLDER');
  fs.writeFileSync(path.join(backupDir, 'scriptorium-20261010T033000Z.archive.gz'), 'NEWEST');
  const r = restore();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(restoredBytes(), 'NEWEST');
  assert.match(calls(), /mongorestore --archive --gzip --nsInclude scriptorium\.\* --nsFrom scriptorium\.\* --nsTo scriptorium_restorecheck\.\* --drop/);
  assert.match(r.stdout, /PASS/);
  assert.ok(dropped(), 'throwaway db dropped');
});

test('restore check uses an archive given as an argument', () => {
  const chosen = seed('scriptorium-20261001T033000Z.archive.gz', 10);
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  fs.writeFileSync(chosen, 'CHOSEN');
  const r = restore({}, [chosen]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(restoredBytes(), 'CHOSEN');
});

test('restore check fails when there is no archive', () => {
  fs.mkdirSync(backupDir);
  const r = restore();
  assert.notEqual(r.status, 0);
  assert.equal(calls(), '');
});

test('restore check fails when a collection is missing from the restore', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ STUB_COUNTS: 'live users 1\nlive works 2\nrestored users 1' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /works.*MISSING/);
  assert.match(r.stdout, /FAIL/);
  assert.ok(dropped(), 'throwaway db dropped even on failure');
});

test('restore check fails when a collection comes back empty but live has documents', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ STUB_COUNTS: 'live users 1\nlive works 2\nrestored users 1\nrestored works 0' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /works.*EMPTY/);
});

test('restore check passes but flags counts that changed since the dump', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ STUB_COUNTS: 'live users 1\nlive auditlogs 8\nrestored users 1\nrestored auditlogs 6' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /auditlogs.*changed since dump/);
  assert.match(r.stdout, /PASS/);
});

test('restore check fails and still drops the throwaway db when mongorestore fails', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ STUB_RESTORE_MODE: 'fail' });
  assert.notEqual(r.status, 0);
  assert.ok(dropped());
});

test('restore check ignores archives of a database whose name only starts with DB', () => {
  fs.mkdirSync(backupDir);
  fs.writeFileSync(path.join(backupDir, 'scriptorium-20261010T033000Z.archive.gz'), 'NEWEST');
  fs.writeFileSync(path.join(backupDir, 'scriptorium-staging-20261011T033000Z.archive.gz'), 'STAGING');
  const r = restore();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(restoredBytes(), 'NEWEST');
});

for (const [env, why] of [
  [{ RESTORE_DB: 'tms' }, 'a RESTORE_DB without the _restorecheck suffix'],
  [{ DB: "x');db.dropDatabase('" }, 'a DB name that is not a plain identifier'],
  [{ RESTORE_DB: "y_restorecheck');db.dropDatabase('" }, 'a RESTORE_DB that is not a plain identifier'],
]) {
  test(`restore check refuses ${why} before calling docker`, () => {
    seed('scriptorium-20261010T033000Z.archive.gz', 1);
    const r = restore(env);
    assert.notEqual(r.status, 0);
    assert.equal(calls(), '');
  });
}

test('restore check refuses more than one archive argument', () => {
  const a = seed('scriptorium-20261009T033000Z.archive.gz', 2);
  const b = seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({}, [a, b]);
  assert.notEqual(r.status, 0);
  assert.equal(calls(), '');
});

test('restore check only flags short-lived collections that are empty or missing in the dump', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({
    STUB_COUNTS: [
      'live users 1', 'live otpcodes 1', 'live webauthnchallenges 2', 'live authsessions 1',
      'restored users 1', 'restored otpcodes 0', 'restored authsessions 0',
    ].join('\n'),
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /otpcodes.*short-lived/);
  assert.match(r.stdout, /webauthnchallenges.*short-lived/);
  assert.match(r.stdout, /PASS/);
});

test('restore check fails and drops the throwaway db when counting fails', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({ STUB_COUNTS_MODE: 'fail' });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /PASS/);
  assert.ok(dropped());
});

test('restore check keeps the throwaway db with --keep', () => {
  seed('scriptorium-20261010T033000Z.archive.gz', 1);
  const r = restore({}, ['--keep']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(dropped(), false);
  assert.match(r.stdout, /scriptorium_restorecheck/);
});

// --- upload to Spaces ---

// The s3cmd stub logs its arguments and, for put, copies the local file to
// STUB_UPLOADED. STUB_S3_MODE=fail makes it fail, hang makes it hang.
const S3CMD_STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_S3_LOG"
case "$STUB_S3_MODE" in
  fail) echo "ERROR: S3 error: 403 (AccessDenied)" >&2; exit 77 ;;
  hang) exec sleep 5 ;;
esac
for a in "$@"; do [ -f "$a" ] && cp "$a" "$STUB_UPLOADED"; done
exit 0
`;

function upload(env = {}, args = []) {
  fs.writeFileSync(path.join(bin, 's3cmd'), S3CMD_STUB, { mode: 0o755 });
  const config = path.join(tmp, 's3cfg');
  if (!fs.existsSync(config)) fs.writeFileSync(config, '[default]\n', { mode: 0o600 });
  return run('spaces-upload.sh', {
    SPACES_CONFIG: config,
    SPACES_URI: 's3://test-bucket/scriptorium/',
    STUB_S3_LOG: path.join(tmp, 's3cmd.log'),
    STUB_UPLOADED: path.join(tmp, 'uploaded'),
    ...env,
  }, args);
}
const s3calls = () => {
  const log = path.join(tmp, 's3cmd.log');
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
};
const uploadedBytes = () => fs.readFileSync(path.join(tmp, 'uploaded'), 'utf8');

test('upload sends the newest archive privately to SPACES_URI with the root-only config', () => {
  fs.mkdirSync(backupDir);
  fs.writeFileSync(path.join(backupDir, 'scriptorium-20261009T180000Z.archive.gz'), 'OLDER');
  const newest = path.join(backupDir, 'scriptorium-20261010T180000Z.archive.gz');
  fs.writeFileSync(newest, 'NEWEST');
  const r = upload();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(uploadedBytes(), 'NEWEST');
  assert.equal(s3calls().trim(),
    `-c ${path.join(tmp, 's3cfg')} put --acl-private --no-progress ${newest} s3://test-bucket/scriptorium/scriptorium-20261010T180000Z.archive.gz`);
  assert.match(r.stdout, /uploaded scriptorium-20261010T180000Z\.archive\.gz to s3:\/\/test-bucket\/scriptorium\//);
  assert.doesNotMatch(r.stdout, /FAILED/);
});

test('upload sends an archive given as an argument', () => {
  const chosen = seed('scriptorium-20261001T180000Z.archive.gz', 10);
  seed('scriptorium-20261010T180000Z.archive.gz', 1);
  fs.writeFileSync(chosen, 'CHOSEN');
  const r = upload({}, [chosen]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(uploadedBytes(), 'CHOSEN');
  assert.match(s3calls(), / s3:\/\/test-bucket\/scriptorium\/scriptorium-20261001T180000Z\.archive\.gz$/m);
});

test('upload ignores archives of a database whose name only starts with DB', () => {
  fs.mkdirSync(backupDir);
  fs.writeFileSync(path.join(backupDir, 'scriptorium-20261010T180000Z.archive.gz'), 'NEWEST');
  fs.writeFileSync(path.join(backupDir, 'scriptorium-staging-20261011T180000Z.archive.gz'), 'STAGING');
  const r = upload();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(uploadedBytes(), 'NEWEST');
});

for (const [env, why] of [
  [{ STUB_S3_MODE: 'fail' }, 's3cmd fails'],
  [{ STUB_S3_MODE: 'hang', UPLOAD_TIMEOUT: '1' }, 's3cmd hangs past UPLOAD_TIMEOUT'],
]) {
  test(`upload logs FAILED, exits non-zero and keeps the local archive when ${why}`, () => {
    const archive = seed('scriptorium-20261010T180000Z.archive.gz', 1);
    const started = Date.now();
    const r = upload(env);
    assert.notEqual(r.status, 0);
    assert.ok(Date.now() - started < 4000, 'did not wait for the hung upload');
    assert.match(r.stdout, /FAILED: s3cmd put of scriptorium-20261010T180000Z\.archive\.gz/);
    assert.doesNotMatch(r.stdout, /uploaded/);
    assert.equal(fs.readFileSync(archive, 'utf8'), 'OLD');
  });
}

test('upload logs FAILED without calling s3cmd when the Spaces config is missing', () => {
  seed('scriptorium-20261010T180000Z.archive.gz', 1);
  const r = upload({ SPACES_CONFIG: path.join(tmp, 'no-such-s3cfg') });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAILED: no Spaces config/);
  assert.equal(s3calls(), '');
});

test('upload logs FAILED without calling s3cmd when there is no archive', () => {
  fs.mkdirSync(backupDir);
  const r = upload();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAILED: no scriptorium-\*\.archive\.gz/);
  assert.equal(s3calls(), '');
});

for (const [env, args, why] of [
  [{ SPACES_URI: 's3://test-bucket/scriptorium' }, [], 'a SPACES_URI without a trailing slash'],
  [{ DB: 'x/../etc' }, [], 'a DB name that is not a plain identifier'],
  [{}, ['a.archive.gz', 'b.archive.gz'], 'more than one archive argument'],
]) {
  test(`upload refuses ${why} before calling s3cmd`, () => {
    seed('scriptorium-20261010T180000Z.archive.gz', 1);
    const r = upload(env, args);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /FAILED/);
    assert.equal(s3calls(), '');
  });
}
