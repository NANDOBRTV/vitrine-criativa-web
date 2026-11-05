#!/bin/sh
# Disposable demonstration only: local database is lost on Render free restarts.
set -eu
PG_BIN=/usr/lib/postgresql/15/bin
PGDATA=/tmp/astracalls-postgres
mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  runuser -u postgres -- "$PG_BIN/initdb" -D "$PGDATA" --auth-host=trust --auth-local=trust --no-instructions > /tmp/astracalls-initdb.log 2>&1 || { cat /tmp/astracalls-initdb.log; exit 1; }
fi
runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c shared_buffers=16MB -c max_connections=30 -c fsync=off" -l /tmp/astracalls-pg.log -w start || { cat /tmp/astracalls-pg.log; exit 1; }
if [ -z "${WACALLS_API_KEY:-}" ]; then
  echo "WACALLS_API_KEY must be supplied via Render environment variables" >&2
  exit 1
fi
export WACALLS_PG_URL="postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable"
export WACALLS_PG_NAMESPACE="astracalls_demo"
export WACALLS_GROUP_CALLS=0
export WACALLS_DEFAULT_TRANSPORT=websocket
exec /usr/local/bin/wacalls -addr ":${PORT:-8080}" -static /app/client/dist
