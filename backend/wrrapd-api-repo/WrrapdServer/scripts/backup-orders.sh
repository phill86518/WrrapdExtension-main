#!/usr/bin/env bash
# Off-VM backup of the pay server's system of record (orders/, customers/, data/) to
# gs://wrrapd-ops-backups. Hourly: orders + customers. With "full": data/ too (daily).
# Secrets (.env) are never included.
#
# Schedulers (systemd — preferred):
#   wrrapd-orders-backup.timer          → hourly at :07
#   wrrapd-orders-backup-full.timer     → daily 03:17 America/New_York
#   wrrapd-orders-backup-watchdog.timer → every 30m; remediates if last success is stale
#
# Upload uses /snap/google-cloud-cli/current/bin/gcloud (NOT /snap/bin/gcloud).
# The /snap/bin wrapper fails under cron/systemd with a DBus "NoSuchUnit" scope error.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin"
export HOME="${HOME:-/home/admin_}"
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-/home/admin_/.config/gcloud}"

ROOT="/home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer"
BUCKET="gs://wrrapd-ops-backups"
PROJECT="wrrapd-chrome-extension"
STAMP="$(TZ=America/New_York date +%Y%m%d-%H%M)"
DAY="$(TZ=America/New_York date +%Y/%m/%d)"
MODE="${1:-hourly}"
LOG_DIR="$ROOT/logs"
OK_FILE="$LOG_DIR/last-backup-ok.txt"
mkdir -p "$LOG_DIR"

GCLOUD="/snap/google-cloud-cli/current/bin/gcloud"
if [ ! -x "$GCLOUD" ]; then
  echo "missing $GCLOUD" >&2
  exit 1
fi

if [ "$MODE" = "watchdog" ]; then
  # Remediates if the last successful backup is older than 90 minutes.
  max_age_sec=$((90 * 60))
  if [ -f "$OK_FILE" ]; then
    last="$(tr -d '[:space:]' < "$OK_FILE" || true)"
    if last_epoch="$(date -u -d "$last" +%s 2>/dev/null)"; then
      now_epoch="$(date -u +%s)"
      age=$((now_epoch - last_epoch))
      if [ "$age" -lt "$max_age_sec" ]; then
        echo "watchdog: last backup ok (${age}s ago); nothing to do"
        exit 0
      fi
      echo "watchdog: last backup stale (${age}s ago); running hourly backup"
    else
      echo "watchdog: could not parse $OK_FILE; running hourly backup"
    fi
  else
    echo "watchdog: missing $OK_FILE; running hourly backup"
  fi
  MODE="hourly"
fi

KIND="$MODE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PATHS=(orders customers)
[ "$KIND" = "full" ] && PATHS+=(data)

ARCHIVE="$TMP/wrrapd-${KIND}-${STAMP}.tgz"
OBJECT_DIR="$BUCKET/vm/$DAY/"
tar -C "$ROOT" -czf "$ARCHIVE" --exclude='*.tmp' "${PATHS[@]}"

ok=0
for attempt in 1 2 3 4 5; do
  if "$GCLOUD" storage cp --quiet "$ARCHIVE" "$OBJECT_DIR" --project "$PROJECT"; then
    ok=1
    break
  fi
  echo "gcloud storage cp failed via $GCLOUD (attempt ${attempt}/5); retrying in 20s..." >&2
  sleep 20
done

if [ "$ok" -ne 1 ]; then
  echo "backup upload failed after 5 attempts" >&2
  exit 1
fi
date -u +%FT%TZ > "$OK_FILE"
echo "backup ok $(cat "$OK_FILE") kind=$KIND dest=${OBJECT_DIR}wrrapd-${KIND}-${STAMP}.tgz"
