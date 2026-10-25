#!/bin/sh
# Hosts mount the data disk owned by root. Fix that, then run the server as the unprivileged user.
# With LITESTREAM_BUCKET set, the database is restored from object storage at start and copied back while the app runs,
# so the data survives hosts that have no persistent disk. Without it the app runs on whatever is in /data.
set -e
mkdir -p /data/output
chown -R app /data 2>/dev/null || true
# Behind a host proxy (and Vercel in front of it) the real visitor address arrives in X-Forwarded-For. The rate limits need it.
export FORWARDED_ALLOW_IPS='*'
PORT_TO_USE="${PORT:-8000}"

if [ -n "$LITESTREAM_BUCKET" ]; then
  # Fetch the newest copy. Nothing exists in the bucket on the very first start, which is not an error.
  # A real failure (wrong keys, unreachable bucket) stops the container here instead of starting with an empty database.
  runuser -u app -- litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "${CATALOGIQ_DB:-/data/catalogiq.db}"
  exec runuser -u app -- litestream replicate -config /etc/litestream.yml -exec "uvicorn main:app --host 0.0.0.0 --port ${PORT_TO_USE}"
fi

exec runuser -u app -- uvicorn main:app --host 0.0.0.0 --port "${PORT_TO_USE}"
