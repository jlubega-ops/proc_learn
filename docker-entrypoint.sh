#!/bin/sh
set -e
# Volume mounts arrive root-owned; the app runs as nextjs.
mkdir -p "${PROC_LEARN_UPLOAD_ROOT:-/data/uploads}"
chown -R nextjs:nodejs "${PROC_LEARN_UPLOAD_ROOT:-/data/uploads}"
exec su-exec nextjs node server.js
