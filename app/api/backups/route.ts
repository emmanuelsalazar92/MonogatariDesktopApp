import { NextResponse } from "next/server";
import { createSQLiteSnapshot } from "@/lib/sqlite-backup";

export async function POST() {
  const backup = await createSQLiteSnapshot();

  return NextResponse.json(backup, { status: 201 });
}
