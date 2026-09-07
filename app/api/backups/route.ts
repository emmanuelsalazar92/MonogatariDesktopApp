import { NextResponse } from "next/server";
import { BackupInProgressError, createSQLiteSnapshot } from "@/lib/sqlite-backup";

export async function POST() {
  try { return NextResponse.json(await createSQLiteSnapshot(), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof BackupInProgressError ? error.message : "Backup creation or verification failed" }, { status: error instanceof BackupInProgressError ? 409 : 500 }); }
}
