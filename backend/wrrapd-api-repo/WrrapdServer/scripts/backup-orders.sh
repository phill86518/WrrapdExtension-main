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
gcloud storage cp --quiet "$ARCHIVE" "$BUCKET/vm/$DAY/" --project wrrapd-chrome-extension
date -u +%FT%TZ > "$ROOT/logs/last-backup-ok.txt"
