# Monogatari

Local-first novel planning, writing, and reading studio built with Next.js, Prisma, and SQLite.

## Requirements

- Node.js 22 or newer
- npm

## First-time development setup

```bash
npm install
npm run setup:dev
npm run dev
```

`setup:dev` generates the Prisma client, applies the SQLite schema, and loads the stable development dataset only when the database has no narrative records. It is safe to run again: an existing database is never reseeded implicitly.

After setup, the visual fixture preflight confirms that `novel-eco-azul`, `ch-1`, `scene-1`, and `scene-2` are active and navigable in Structure, Editor, and Reader.

## Visual QA preflight

Run this before screenshots, visual regression checks, or E2E work that requires manuscript content:

```bash
npm run qa:fixtures
```

If the fixtures are missing, the command fails early with setup instructions. When the database contains other narrative data, `setup:dev` preserves it and also fails rather than silently replacing it.

## Resetting the development dataset

> **Destructive:** `setup:dev:reset` replaces the local narrative data in `prisma/dev.db` with the repository fixtures. Back up any content you need before running it.

```bash
npm run setup:dev:reset
```

Use reset only when you explicitly want the known fixture dataset. A normal `npm run dev`, `db:push`, or `setup:dev` never performs this destructive reset on a populated database.

## Prisma commands

```bash
npm run db:generate  # regenerate the Prisma client
npm run db:push      # apply schema changes without seeding
npm run db:seed      # destructive seed; prefer setup:dev:reset for clarity
npm run db:studio    # inspect the local database
```

The local database, journals, and runtime backups are ignored by Git. Synthetic backup fixtures belong under `tests/fixtures/backups/`; see [docs/backup-artifacts.md](docs/backup-artifacts.md).

## Validation

```bash
npm run typecheck
npm run lint
npm run test:routes
npm run test:repository-hygiene
npm run test:dev-fixtures
npm run build
```
