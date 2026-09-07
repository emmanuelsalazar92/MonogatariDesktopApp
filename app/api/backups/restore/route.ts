import { NextResponse } from "next/server";
import { RestoreError, RestoreInProgressError, restoreSQLiteSnapshot } from "@/lib/sqlite-backup";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid restore request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "backupId" && key !== "confirmed")) return NextResponse.json({ error: "Invalid restore request" }, { status: 400 });
  const input = body as { backupId?: unknown; confirmed?: unknown };
  if (typeof input.backupId !== "string" || input.confirmed !== true) return NextResponse.json({ error: "Explicit restore confirmation is required" }, { status: 400 });
  try { return NextResponse.json(await restoreSQLiteSnapshot(input.backupId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Restore failed" }, { status: error instanceof RestoreInProgressError ? 409 : error instanceof RestoreError ? 422 : 500 }); }
}
