#!/bin/sh
# =============================================================================
# Xplora container entrypoint
# -----------------------------------------------------------------------------
# Security: the application must NOT run as root. The image defines a
# non-root user "xplora" (uid/gid 1000) and this script drops privileges to
# it before starting the app.
#
# Persistent directories (/app/data, poster cache) are usually bind- or
# volume-mounted from the host with root ownership. We fix up their
# ownership here — while we still have root — then hand off to the app.
# =============================================================================
set -e

DATA_DIR="${XPLORA_DATA_DIR:-/app/data}"
POSTER_DIR="${POSTER_STORAGE_DIR:-/app/backend/static/posters}"

mkdir -p "$DATA_DIR" "$POSTER_DIR"

if ! chown -R xplora:xplora "$DATA_DIR" "$POSTER_DIR" 2>/dev/null; then
    echo "[entrypoint] WARNING: could not chown '$DATA_DIR' / '$POSTER_DIR' to uid 1000." >&2
    echo "[entrypoint] If the app cannot write to them, fix on the host:" >&2
    echo "[entrypoint]     chown -R 1000:1000 ./data" >&2
fi

exec setpriv --reuid=xplora --regid=xplora --init-groups "$@"
