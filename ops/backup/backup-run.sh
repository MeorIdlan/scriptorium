#!/usr/bin/env bash
# The nightly backup job: dump, then (only if the dump succeeded) the upload to
# Spaces, then a ping to a Healthchecks.io check. Success pings the check URL;
# a failed dump or upload pings <url>/fail with the tail of this run's output,
# so the alert email shows the FAILED line. If no ping arrives at all (cron or
# the droplet down), Healthchecks alerts once the grace period runs out.
# Step output is passed through to stdout, which cron appends to the log.
# Exits with the backup's own status; a failed ping never changes it.
# Installed on the droplet as /usr/local/sbin/scriptorium-backup-run and run
# from /etc/cron.d/scriptorium-backup. See docs/deployment.md → Data.
set -uo pipefail

DUMP_CMD="${DUMP_CMD:-/usr/local/sbin/scriptorium-mongo-dump}"
UPLOAD_CMD="${UPLOAD_CMD:-/usr/local/sbin/scriptorium-spaces-upload}"
# The check's ping URL: root-only, never in the repo (anyone holding it can
# mark the check green).
HC_URL_FILE="${HC_URL_FILE:-/etc/scriptorium-backup/healthchecks-url}"

log() { echo "$(date -u +%FT%TZ) backup-run: $*"; }

out="$(mktemp)"
trap 'rm -f "$out"' EXIT

{ "$DUMP_CMD" && "$UPLOAD_CMD"; } 2>&1 | tee "$out"
status=${PIPESTATUS[0]}

url=""
[ -r "$HC_URL_FILE" ] && url="$(tr -d '[:space:]' < "$HC_URL_FILE")"
if [ -z "$url" ]; then
  log "WARN: no healthchecks URL in $HC_URL_FILE; no ping sent"
  exit "$status"
fi

if [ "$status" -eq 0 ]; then
  ping_url="$url"
else
  ping_url="$url/fail"
fi
if tail -c 10000 "$out" | curl -fsS -m 10 --retry 3 -o /dev/null --data-binary @- "$ping_url"; then
  log "pinged healthchecks ($([ "$status" -eq 0 ] && echo ok || echo fail))"
else
  log "WARN: healthchecks ping failed; the check will alert as missed"
fi
exit "$status"
