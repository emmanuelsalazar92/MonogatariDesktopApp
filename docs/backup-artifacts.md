# Backup artifact policy

Monogatari stores local runtime backup packages in `prisma/backups/`. Manual backups are portable ZIP files containing only `database.sqlite` and `manifest.json`; neither file records an absolute host path, hostname, secret, cache, or temporary runtime data. The backup endpoint may create this directory automatically, and every file below it is ignored by Git because it can contain private manuscript data.

`Create backup now` creates a consistent SQLite backup, writes a versioned manifest with inventory and SHA-256 checksums, and verifies the package (ZIP structure, manifest, checksum, and SQLite integrity) before it is recorded as `Manual · Valid`. A failed package is not promoted as recoverable. The directory can be copied between supported Windows and macOS installations; use only the future supported restore flow to apply it.

The other local SQLite runtime files remain in `prisma/dev.db` and its journal files. They are covered by the existing `prisma/*.db` and `prisma/*.db-journal` rules.

## Versioned fixtures

Tests that need backup-like input must use `tests/fixtures/backups/`. Fixtures in that directory must be synthetic, minimal, and free of real user or manuscript data. The fixture path is intentionally outside the ignored runtime directory, so fixtures can be reviewed and versioned normally without `.gitignore` exceptions.

Do not add negated rules below `prisma/backups/` to force individual runtime snapshots into Git. Move any safe, intentional fixture to `tests/fixtures/backups/` instead.
