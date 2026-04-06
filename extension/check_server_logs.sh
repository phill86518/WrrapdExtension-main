#!/bin/bash
# Script to check Flask/gunicorn application logs on GCP

echo "=== Checking if Flask/gunicorn is running ==="
ps aux | grep -E "(gunicorn|flask|python.*app.py)" | grep -v grep

echo ""
echo "=== Checking for application logs ==="
echo "If using gunicorn, logs might be in:"
echo "  - stdout/stderr (if run in terminal)"
echo "  - /var/log/gunicorn/ (if configured)"
echo "  - journalctl (if run as systemd service)"

echo ""
echo "=== To see real-time logs, run: ==="
echo "  journalctl -u your-service-name -f"
echo "  OR"
echo "  tail -f /path/to/gunicorn/logs"
echo "  OR"
echo "  If running in terminal, logs appear there"

echo ""
echo "=== To test the endpoint and see logs: ==="
echo "  curl -X POST http://localhost:5000/generate-ideas \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"occasion\":\"test\"}'"

