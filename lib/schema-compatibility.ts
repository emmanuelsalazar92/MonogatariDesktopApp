import "server-only";

import Database from "better-sqlite3";
import { databasePath } from "@/lib/db/prisma";

const migrationId = "2026-09-08-notion-mapping-scene-cursors";
const requiredColumns = ["lastSyncedRevision", "lastSyncedContent", "lastSyncedAt", "remoteLastEditedAt", "remoteArchivedAt"];

export type SchemaCompatibility =
  | { compatible: true; code: "SCHEMA_COMPATIBLE"; detail: string }
  | { compatible: false; code: "DATABASE_UNAVAILABLE" | "SCHEMA_TABLE_MISSING" | "SCHEMA_COLUMN_MISSING" | "SCHEMA_MIGRATION_MISSING" | "SCHEMA_NEWER_THAN_RUNTIME"; detail: string; action: string };

export class SchemaCompatibilityError extends Error {
  constructor(public readonly code: Exclude<SchemaCompatibility["code"], "SCHEMA_COMPATIBLE">, message: string) { super(message); }
}

export function inspectSchemaCompatibility(path = databasePath): SchemaCompatibility {
  let db: InstanceType<typeof Database>;
  try { db = new Database(path, { readonly: true }); }
  catch { return { compatible: false, code: "DATABASE_UNAVAILABLE", detail: "The persisted SQLite database cannot be opened.", action: "Verify the data volume, file permissions, and database path." }; }
  try {
    const tableExists = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
    if (!tableExists("NotionMapping")) return { compatible: false, code: "SCHEMA_TABLE_MISSING", detail: "Required table NotionMapping is missing; this database is older than the running build.", action: "Run the supported production migration against this existing data volume." };
    if (!tableExists("SchemaMigration")) return { compatible: false, code: "SCHEMA_TABLE_MISSING", detail: "Required table SchemaMigration is missing; migration compatibility cannot be verified.", action: "Run the supported production migration against this existing data volume." };
    const columns = new Set((db.prepare('PRAGMA table_info("NotionMapping")').all() as Array<{ name: string }>).map((row) => row.name));
    const missing = requiredColumns.filter((column) => !columns.has(column));
    if (missing.length) return { compatible: false, code: "SCHEMA_COLUMN_MISSING", detail: `Required column(s) missing: ${missing.map((column) => `NotionMapping.${column}`).join(", ")}. Database appears older than this build.`, action: "Run the supported production migration; do not reset or recreate the database." };
    const markers = (db.prepare('SELECT id FROM "SchemaMigration"').all() as Array<{ id: string }>).map((row) => row.id);
    if (!markers.includes(migrationId)) return { compatible: false, code: "SCHEMA_MIGRATION_MISSING", detail: `Required migration marker is missing: ${migrationId}.`, action: "Run the supported production migration and verify it completes." };
    const newer = markers.find((id) => id > migrationId);
    if (newer) return { compatible: false, code: "SCHEMA_NEWER_THAN_RUNTIME", detail: `Database migration marker ${newer} is newer than the running build understands.`, action: "Deploy a Monogatari image compatible with this database, or restore a verified matching backup." };
    return { compatible: true, code: "SCHEMA_COMPATIBLE", detail: "Required tables, scene cursor columns, and migration markers are compatible with this build." };
  } finally { db.close(); }
}

export function assertSchemaCompatible() {
  const result = inspectSchemaCompatibility();
  if (!result.compatible) throw new SchemaCompatibilityError(result.code, result.detail);
}
