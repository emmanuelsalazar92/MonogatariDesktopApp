# Persistent SQLite database upgrades

Docker volumes preserve `/data/dev.db` across image upgrades. The container
entrypoint therefore uses two distinct paths:

* A new database is initialized once with `prisma db push`.
* An existing database is upgraded only by `scripts/migrate-production-database.mjs` before Next.js starts.

The production migration runner records each version in `SchemaMigration`, runs
every migration in a SQLite transaction, verifies `PRAGMA integrity_check`, and
is safe to run again. It never deletes, recreates, reseeds, or runs `db push`
against an existing `/data/dev.db`.

The Docker health endpoint is a readiness probe, not merely a process probe. It
performs read-only checks of the required `NotionMapping` columns and the
current `SchemaMigration` marker. A missing or failed upgrade returns HTTP 503
and logs a database compatibility diagnostic; no health probe writes data.

Every production Prisma schema change must include a corresponding explicit,
idempotent migration in `scripts/migrate-production-database.mjs` and a test
starting from the previous schema. Do not rely on a fresh volume or on a
manual `prisma db push` for an upgrade path.
