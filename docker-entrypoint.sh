#!/bin/sh
set -eu

data_dir="${MONOGATARI_DATA_DIR:-/data}"
db_path="${MONOGATARI_DATABASE_PATH:-$data_dir/dev.db}"
mkdir -p "$data_dir" "$data_dir/backups"

# A bind mount, named volume, or tmpfs hides the image's pre-chowned /data
# directory. Set its ownership at startup before Prisma creates SQLite files.
chown -R node:node "$data_dir"

# A fresh volume needs the schema. Existing databases are never reseeded or
# reset; upgrades require an explicit compatible migration strategy.
if [ ! -f "$db_path" ]; then
  MONOGATARI_DATABASE_PATH="$db_path" ./node_modules/.bin/prisma db push --skip-generate
fi

# The schema initialization above needs to repair a freshly mounted /data, but
# the long-running Next.js process must not run as root.
chown -R node:node "$data_dir"
exec setpriv --reuid=node --regid=node --init-groups "$@"
