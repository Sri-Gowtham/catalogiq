#!/bin/sh
# Hosts mount the data disk owned by root. Fix that, then run the server as the unprivileged user.
set -e
mkdir -p /data/output
chown -R app /data 2>/dev/null || true
exec runuser -u app -- uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
