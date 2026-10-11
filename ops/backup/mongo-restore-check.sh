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

die() { echo "mongo-restore-check: $*" >&2; exit 2; }

keep=false
archive=""
for arg in "$@"; do
  case "$arg" in
    --keep) keep=true ;;
    -*) die "unknown option $arg" ;;
    *) archive="$arg" ;;
  esac
done

# Names go into a mongosh --eval string, so allow only plain identifiers.
for name in "$DB" "$RESTORE_DB"; do
  [[ "$name" =~ ^[A-Za-z0-9_]+$ ]] || die "invalid database name '$name'"
done
[ "$RESTORE_DB" != "$DB" ] || die "RESTORE_DB must differ from DB ($DB)"

if [ -z "$archive" ]; then
  shopt -s nullglob
  archives=("$BACKUP_DIR/$DB"-*.archive.gz)  # names carry UTC timestamps, so the last sorts newest
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
# empty while live has documents, fails the check.
if echo "$counts" | awk '
  $1 == "live"     { live[$2] = $3 + 0; order[++n] = $2 }
  $1 == "restored" { rest[$2] = $3 + 0 }
  END {
    fail = (n == 0)
    if (n == 0) print "live database has no collections"
    printf "%-22s %9s %9s  %s\n", "collection", "live", "restored", "status"
    for (i = 1; i <= n; i++) {
      c = order[i]
      if (!(c in rest))                     { r = "-"; st = "MISSING"; fail = 1 }
      else if (live[c] > 0 && rest[c] == 0) { r = rest[c]; st = "EMPTY"; fail = 1 }
      else if (live[c] != rest[c])          { r = rest[c]; st = "changed since dump" }
      else                                  { r = rest[c]; st = "ok" }
      printf "%-22s %9s %9s  %s\n", c, live[c], r, st
    }
    for (c in rest) if (!(c in live)) printf "%-22s %9s %9s  %s\n", c, "-", rest[c], "only in dump"
    exit fail
  }'; then
  echo "PASS: $archive restores cleanly into $RESTORE_DB"
else
  echo "FAIL: $archive did not restore as expected"
  exit 1
fi
