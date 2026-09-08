#!/bin/sh
set -eu

data_dir="${MONOGATARI_DATA_DIR:-/data}"
db_path="${MONOGATARI_DATABASE_PATH:-$data_dir/dev.db}"
mkdir -p "$data_dir" "$data_dir/backups"

# A bind mount, named volume, or tmpfs hides the image's pre-chowned /data
# directory. Set its ownership at startup before Prisma creates SQLite files.
chown -R node:node "$data_dir"

# A fresh volume needs the complete current schema. Existing databases are
# never db-pushed, reset, or reseeded: versioned SQLite migrations run below.
if [ ! -f "$db_path" ]; then
  MONOGATARI_DATABASE_PATH="$db_path" ./node_modules/.bin/prisma db push
fi

# Must complete before Next.js can open Prisma. This is deliberately an
# explicit, idempotent migration runner rather than production `db push`.
node ./scripts/migrate-production-database.mjs "$db_path"

# The schema initialization above needs to repair a freshly mounted /data, but
# the long-running Next.js process must not run as root.
chown -R node:node "$data_dir"
exec setpriv --reuid=node --regid=node --init-groups "$@"
