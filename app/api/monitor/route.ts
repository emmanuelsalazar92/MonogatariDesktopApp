import { NextResponse } from "next/server";
import { runRuntimeDiagnostics } from "@/lib/runtime-monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await runRuntimeDiagnostics(), { headers: { "Cache-Control": "no-store" } });
}
