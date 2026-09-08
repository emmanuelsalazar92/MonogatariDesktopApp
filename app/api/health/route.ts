import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { NextResponse } from "next/server";
import { prisma, runtimeDataDirectory } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [, , migrationRows] = await Promise.all([
      prisma.$queryRawUnsafe("SELECT 1"),
      // A connection-only probe can be green against a stale persistent
      // SQLite file. Read the columns introduced by the current supported
      // schema and confirm the startup migration marker instead.
      prisma.$queryRawUnsafe(`SELECT "lastSyncedRevision", "lastSyncedContent", "lastSyncedAt",
        "remoteLastEditedAt", "remoteArchivedAt" FROM "NotionMapping" LIMIT 1`),
      prisma.$queryRawUnsafe(`SELECT 1 FROM "SchemaMigration"
        WHERE "id" = '2026-09-08-notion-mapping-scene-cursors' LIMIT 1`),
      access(runtimeDataDirectory, constants.R_OK | constants.W_OK)
    ]);
    if (!Array.isArray(migrationRows) || migrationRows.length !== 1) {
      throw new Error("required database migration has not completed");
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Keep the probe response safe for Docker, while giving operators a clear
    // startup diagnostic instead of a later unrelated Prisma feature failure.
    console.error("monogatari_readiness_failed", {
      reason: "database initialization or schema compatibility check failed",
      error: error instanceof Error ? error.message : "unknown error"
    });
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
