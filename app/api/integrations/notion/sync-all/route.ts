import { NextResponse } from "next/server";

import { syncAllConnectedNovels } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { SchemaCompatibilityError } from "@/lib/schema-compatibility";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  try {
    const results = await syncAllConnectedNovels();
    return NextResponse.json({ ok: true, results, message: results.length ? `Synced ${results.filter((result) => result.ok).length} of ${results.length} connected novels.` : "No novels are connected to Notion." });
  } catch (error) {
    if (error instanceof SchemaCompatibilityError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 503 });
    return NextResponse.json({ ok: false, code: "SYNC_ALL_FAILED", message: "Monogatari could not run the requested sync." }, { status: 500 });
  }
}
