#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GCP_PROJECT_ID:-}" || -z "${BACKUP_BUCKET:-}" ]]; then
  echo "Set GCP_PROJECT_ID and BACKUP_BUCKET before running."
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_URI="gs://${BACKUP_BUCKET}/firestore-exports/${STAMP}"

echo "Starting Firestore export to ${OUTPUT_URI}"
gcloud firestore export "${OUTPUT_URI}" --project="${GCP_PROJECT_ID}" --async
echo "Export started."
