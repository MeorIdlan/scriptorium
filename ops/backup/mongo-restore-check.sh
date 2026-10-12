#!/usr/bin/env bash
# Restore drill: restores a dump into a throwaway database on the same Mongo
# and compares document counts per collection with the live database.
#   mongo-restore-check.sh [archive] [--keep]
# Without an archive it uses the newest $BACKUP_DIR/<db>-*.archive.gz. The
# throwaway db ($RESTORE_DB) is dropped afterwards unless --keep is given.
# Exits 0 on PASS, 1 on FAIL. Never writes to $DB itself.
set -euo pipefail

MONGO_CONTAINER="${MONGO_CONTAINER:-mongo-mongo-1}"
DB="${DB:-scriptorium}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/scriptorium}"
RESTORE_DB="${RESTORE_DB:-${DB}_restorecheck}"
# TTL-expired auth records: the live count moves minute to minute, so these
# are flagged but never fail the check.
VOLATILE_COLLECTIONS="${VOLATILE_COLLECTIONS:-authsessions otpcodes webauthnchallenges}"

die() { echo "mongo-restore-check: $*" >&2; exit 2; }

keep=false
archive=""
for arg in "$@"; do
  case "$arg" in
    --keep) keep=true ;;
    -*) die "unknown option $arg" ;;
    *) [ -z "$archive" ] || die "give at most one archive"; archive="$arg" ;;
  esac
done

# Names go into a mongosh --eval string, so allow only plain identifiers.
for name in "$DB" "$RESTORE_DB"; do
  [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]] || die "invalid database name '$name'"
done
[ "$RESTORE_DB" != "$DB" ] || die "RESTORE_DB must differ from DB ($DB)"
# The drill drops RESTORE_DB, so it may only ever name a throwaway database.
[[ "$RESTORE_DB" == *_restorecheck ]] || die "RESTORE_DB must end in _restorecheck"

if [ -z "$archive" ]; then
  shopt -s nullglob
  archives=("$BACKUP_DIR/$DB"-[0-9]*T[0-9]*Z.archive.gz)  # names carry UTC timestamps, so the last sorts newest
  shopt -u nullglob
  [ ${#archives[@]} -gt 0 ] || die "no $DB-*.archive.gz in $BACKUP_DIR"
  archive="${archives[-1]}"
fi
[ -s "$archive" ] || die "archive $archive is missing or empty"

drop_restore_db() {
  if $keep; then
    echo "kept throwaway database $RESTORE_DB (drop it with: db.getSiblingDB('$RESTORE_DB').dropDatabase())"
  else
    docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$RESTORE_DB').dropDatabase()" >/dev/null
    echo "dropped throwaway database $RESTORE_DB"
  fi
}
trap drop_restore_db EXIT

echo "restoring $archive into $RESTORE_DB"
docker exec -i "$MONGO_CONTAINER" mongorestore --archive --gzip \
  --nsInclude "$DB.*" --nsFrom "$DB.*" --nsTo "$RESTORE_DB.*" --drop < "$archive"

counts=$(docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "
  for (const [tag, name] of [['live', '$DB'], ['restored', '$RESTORE_DB']]) {
    const d = db.getSiblingDB(name);
    d.getCollectionNames().sort().forEach(c => print(tag, c, d.getCollection(c).countDocuments({})));
  }")

# Live counts can move on after the dump (new audit logs, sessions), so a
# difference is only flagged. A missing collection, or one that came back
# empty while live has documents, fails the check, except for the volatile
# collections, which are only flagged.
if echo "$counts" | awk -v volatile="$VOLATILE_COLLECTIONS" '
  BEGIN            { nv = split(volatile, v, " "); for (i = 1; i <= nv; i++) vol[v[i]] = 1 }
  $1 == "live"     { live[$2] = $3 + 0; order[++n] = $2 }
  $1 == "restored" { rest[$2] = $3 + 0 }
  END {
    fail = (n == 0)
    if (n == 0) print "live database has no collections"
    printf "%-22s %9s %9s  %s\n", "collection", "live", "restored", "status"
    for (i = 1; i <= n; i++) {
      c = order[i]
      if (!(c in rest))                     st = (c in vol) ? "short-lived, not in dump" : "MISSING"
      else if (live[c] > 0 && rest[c] == 0) st = (c in vol) ? "short-lived, changed since dump" : "EMPTY"
      else if (live[c] != rest[c])          st = "changed since dump"
      else                                  st = "ok"
      if (st == "MISSING" || st == "EMPTY") fail = 1
      printf "%-22s %9s %9s  %s\n", c, live[c], (c in rest) ? rest[c] : "-", st
    }
    for (c in rest) if (!(c in live)) printf "%-22s %9s %9s  %s\n", c, "-", rest[c], "only in dump"
    exit fail
  }'; then
  echo "PASS: $archive restores cleanly into $RESTORE_DB"
else
  echo "FAIL: $archive did not restore as expected"
  exit 1
fi
