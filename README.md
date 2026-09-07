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

## LAN access

`npm run dev` and `npm run start` bind to all local interfaces, so the same
installation can be opened through `http://localhost:<port>` or its current
LAN IP without changing source code. Monogatari's browser API calls are
same-origin relative paths; it does not redirect them to `localhost` and does
not enable a wildcard CORS policy. On startup, the development server also
discovers the machine's current IPv4 interfaces for Next's development-asset
origin checks; a DHCP change only requires restarting the server.

To open the app from another device, use the host machine's current LAN IP and
the selected port, then allow that port through the host firewall. The IP may
change through DHCP; restart the server if necessary and use the new address.
This applies on Windows and macOS alike.

For an HTTPS reverse proxy or named local host, configure the proxy to pass the
original `Host` header and add its exact public origin to
`MONOGATARI_TRUSTED_ORIGINS` in `.env.local` (comma-separated for multiple
origins). Do not add a machine LAN IP to source control. There are no Server
Actions, WebSockets, or SSE endpoints in this application; Notion requests are
server-to-server and are initiated through the same-origin `/api/integrations/notion/*`
routes.

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

## Docker installation and upgrades

The production image runs on `linux/amd64` and `linux/arm64`. It stores the SQLite database and verified ZIP backups in `/data`, a named Docker volume by default. The image is disposable; the `monogatari-data` volume is not.

Create a `.env` file only if you need Notion integration or a different published image owner/tag. Do not put secrets in the image or commit this file.

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Set `MONOGATARI_IMAGE_OWNER` to the GitHub user or organization that owns the GHCR package. Use the same pull/up commands to upgrade: Compose replaces the container while retaining `monogatari-data`. To expose backups on the host, replace the named-volume mount in `docker-compose.yml` with a bind mount to a directory you explicitly choose. Do not delete the volume when removing or upgrading the container.

Compose exposes Monogatari at `http://localhost:3010` by default. Set `MONOGATARI_PORT` to another available host port when needed; the container always listens on port 3000 internally.

On a fresh volume, startup creates the SQLite schema but never seeds example data. Existing databases are not reset or modified by startup; a release that needs a schema upgrade must supply and document a compatible migration first. Downgrades are not guaranteed to be safe.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:routes
npm run test:repository-hygiene
npm run test:dev-fixtures
npm run build
```

`npm test` runs the data-safety test suite in a child process with a fresh
database path under the operating system temporary directory
(`MONOGATARI_DATABASE_PATH`). It removes that directory afterwards, so the
suite never opens or changes
`prisma/dev.db`, runtime backups, or a local manuscript. The CI workflow runs
typecheck, lint, this isolated suite, and a production build on Windows and
macOS.
