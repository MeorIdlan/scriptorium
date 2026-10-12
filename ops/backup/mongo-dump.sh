#!/usr/bin/env bash
# Nightly dump of the scriptorium database from the shared Mongo container.
# Writes $BACKUP_DIR/<db>-<UTC timestamp>.archive.gz, then deletes this
# database's archives older than $RETENTION_DAYS. Pruning runs only after a
# successful dump, so a run of failures never ages out the last good copy.
# Installed on the droplet as /usr/local/sbin/scriptorium-mongo-dump and run
# by scriptorium-backup-run from /etc/cron.d/scriptorium-backup. See
# docs/deployment.md → Data.
set -euo pipefail

MONGO_CONTAINER="${MONGO_CONTAINER:-mongo-mongo-1}"
DB="${DB:-scriptorium}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/scriptorium}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DUMP_TIMEOUT="${DUMP_TIMEOUT:-3600}"  # seconds; a hung dump fails instead of blocking the next night's run

log() { echo "$(date -u +%FT%TZ) mongo-dump[$DB]: $*"; }

# DB ends up in file names and the prune pattern.
[[ "$DB" =~ ^[A-Za-z0-9_-]+$ ]] || { log "FAILED: invalid database name"; exit 2; }

# Dumps hold passkeys, session tokens and writers' API keys: owner-only.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

final="$BACKUP_DIR/$DB-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
tmp="$final.tmp"
trap 'rm -f "$tmp"' EXIT

if ! timeout "$DUMP_TIMEOUT" docker exec "$MONGO_CONTAINER" mongodump --db "$DB" --archive --gzip > "$tmp"; then
  log "FAILED: mongodump exited non-zero or timed out; nothing written, nothing pruned"
  exit 1
fi
if [ ! -s "$tmp" ]; then
  log "FAILED: mongodump produced an empty archive; nothing written, nothing pruned"
  exit 1
fi
mv "$tmp" "$final"
log "wrote $final ($(stat -c %s "$final") bytes)"

find "$BACKUP_DIR" -maxdepth 1 -type f -name "$DB-[0-9]*T[0-9]*Z.archive.gz" \
  -mmin +$((RETENTION_DAYS * 24 * 60)) -print -delete |
  while read -r old; do log "pruned $old"; done
