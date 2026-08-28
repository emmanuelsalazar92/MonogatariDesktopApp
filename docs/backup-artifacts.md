# Backup artifact policy

Monogatari stores local runtime backup snapshots in `prisma/backups/`. The backup endpoint and recovery safeguards may create this directory automatically, and every file below it is ignored by Git because it can contain private manuscript data.

The other local SQLite runtime files remain in `prisma/dev.db` and its journal files. They are covered by the existing `prisma/*.db` and `prisma/*.db-journal` rules.

## Versioned fixtures

Tests that need backup-like input must use `tests/fixtures/backups/`. Fixtures in that directory must be synthetic, minimal, and free of real user or manuscript data. The fixture path is intentionally outside the ignored runtime directory, so fixtures can be reviewed and versioned normally without `.gitignore` exceptions.

Do not add negated rules below `prisma/backups/` to force individual runtime snapshots into Git. Move any safe, intentional fixture to `tests/fixtures/backups/` instead.
