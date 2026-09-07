#!/bin/sh
set -eu

data_dir="${MONOGATARI_DATA_DIR:-/data}"
db_path="${MONOGATARI_DATABASE_PATH:-$data_dir/dev.db}"
mkdir -p "$data_dir" "$data_dir/backups"

# A fresh volume needs the schema. Existing databases are never reseeded or
# reset; upgrades require an explicit compatible migration strategy.
if [ ! -f "$db_path" ]; then
  MONOGATARI_DATABASE_PATH="$db_path" ./node_modules/.bin/prisma db push --skip-generate
fi

exec "$@"
