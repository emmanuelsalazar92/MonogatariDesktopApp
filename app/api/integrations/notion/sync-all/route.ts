import { NextResponse } from "next/server";

import { syncAllConnectedNovels } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  const results = await syncAllConnectedNovels();
  return NextResponse.json({ ok: true, results, message: results.length ? `Synced ${results.filter((result) => result.ok).length} of ${results.length} connected novels.` : "No novels are connected to Notion." });
}
