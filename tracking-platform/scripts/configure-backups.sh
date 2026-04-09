#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BACKUP_BUCKET:-}" ]]; then
  echo "Set BACKUP_BUCKET (without gs://) before running."
  exit 1
fi

echo "Enabling object versioning on gs://${BACKUP_BUCKET}"
gcloud storage buckets update "gs://${BACKUP_BUCKET}" --versioning

echo "Applying lifecycle policy"
gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
  --lifecycle-file="infra/gcs-lifecycle.json"

echo "Done. Consider scheduling scripts/firestore-export.sh via Cloud Scheduler."
