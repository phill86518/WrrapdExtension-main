#!/usr/bin/env bash
# Off-VM backup of the pay server's system of record (orders/, customers/, data/) to
# gs://wrrapd-ops-backups. Hourly: orders + customers. With "full": data/ too (daily).
# Secrets (.env) are never included. Cron (admin_):
#   7 * * * *  /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/scripts/backup-orders.sh
#   17 3 * * * /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer/scripts/backup-orders.sh full
set -euo pipefail
export PATH="/snap/bin:/usr/local/bin:/usr/bin:/bin"

ROOT="/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer"
BUCKET="gs://wrrapd-ops-backups"
STAMP="$(TZ=America/New_York date +%Y%m%d-%H%M)"
DAY="$(TZ=America/New_York date +%Y/%m/%d)"
KIND="${1:-hourly}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PATHS=(orders customers)
[ "$KIND" = "full" ] && PATHS+=(data)

ARCHIVE="$TMP/wrrapd-${KIND}-${STAMP}.tgz"
tar -C "$ROOT" -czf "$ARCHIVE" --exclude='*.tmp' "${PATHS[@]}"
# Snap gcloud sometimes fails with a transient DBus "NoSuchUnit" scope error; retry a few times.
ok=0
for attempt in 1 2 3 4 5; do
  if gcloud storage cp --quiet "$ARCHIVE" "$BUCKET/vm/$DAY/" --project wrrapd-chrome-extension; then
    ok=1
    break
  fi
  echo "gcloud storage cp failed (attempt ${attempt}/5); retrying in 20s..." >&2
  sleep 20
done
if [ "$ok" -ne 1 ]; then
  echo "gcloud storage cp failed after 5 attempts" >&2
  exit 1
fi
date -u +%FT%TZ > "$ROOT/logs/last-backup-ok.txt"
