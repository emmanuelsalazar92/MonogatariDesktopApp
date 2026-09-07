import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { NextResponse } from "next/server";
import { prisma, runtimeDataDirectory } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.all([
      prisma.$queryRawUnsafe("SELECT 1"),
      access(runtimeDataDirectory, constants.R_OK | constants.W_OK)
    ]);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
