#!/usr/bin/env bash
# Off-box copy: uploads a dump to a private DigitalOcean Spaces bucket.
#   spaces-upload.sh [archive]
# Without an archive it uses the newest $BACKUP_DIR/<db>-*.archive.gz. The
# local archive is never touched, so a failed upload loses nothing; it logs
# FAILED and exits 1. Spaces keeps its own copies for as long as the bucket's
# lifecycle rule says (spaces-lifecycle.xml).
# Installed on the droplet as /usr/local/sbin/scriptorium-spaces-upload and run
# by scriptorium-backup-run after a successful dump. See
# docs/deployment.md → Data.
set -euo pipefail

DB="${DB:-scriptorium}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/scriptorium}"
# s3cmd config with the Spaces endpoint and key: root-only, never in the repo.
SPACES_CONFIG="${SPACES_CONFIG:-/etc/scriptorium-backup/s3cfg}"
# The bucket is shared by the dev's apps; scriptorium keeps to scriptorium/.
SPACES_URI="${SPACES_URI:-s3://cell1337-bucket/scriptorium/backups/}"
UPLOAD_TIMEOUT="${UPLOAD_TIMEOUT:-1800}"  # seconds; a hung upload fails instead of blocking the next night's run

log() { echo "$(date -u +%FT%TZ) spaces-upload[$DB]: $*"; }
fail() { log "FAILED: $*"; exit 1; }

[ $# -le 1 ] || fail "give at most one archive"
[[ "$DB" =~ ^[A-Za-z0-9_-]+$ ]] || fail "invalid database name"
[[ "$SPACES_URI" == s3://*/ ]] || fail "SPACES_URI must look like s3://<bucket>/<prefix>/"
[ -r "$SPACES_CONFIG" ] || fail "no Spaces config at $SPACES_CONFIG; nothing uploaded"

archive="${1:-}"
if [ -z "$archive" ]; then
  shopt -s nullglob
  archives=("$BACKUP_DIR/$DB"-[0-9]*T[0-9]*Z.archive.gz)  # names carry UTC timestamps, so the last sorts newest
  shopt -u nullglob
  [ ${#archives[@]} -gt 0 ] || fail "no $DB-*.archive.gz in $BACKUP_DIR; nothing uploaded"
  archive="${archives[-1]}"
fi
[ -s "$archive" ] || fail "archive $archive is missing or empty; nothing uploaded"

name="$(basename "$archive")"
if ! timeout "$UPLOAD_TIMEOUT" s3cmd -c "$SPACES_CONFIG" put --acl-private --no-progress \
     "$archive" "$SPACES_URI$name"; then
  fail "s3cmd put of $name exited non-zero or timed out; local copy kept"
fi
log "uploaded $name to $SPACES_URI"
