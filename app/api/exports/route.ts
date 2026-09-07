import { NextResponse } from "next/server";

import { ExportError, readExportRequest } from "@/lib/export-contract";
import { canonicalExportService } from "@/lib/export-service";
import { isTrustedMutationRequest } from "@/lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return errorResponse(new ExportError("INVALID_REQUEST", "Untrusted export request.", 403, false));

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(new ExportError("INVALID_REQUEST", "Invalid JSON body.", 400));
  }
  const parsed = readExportRequest(payload);
  if (!parsed.ok) return errorResponse(parsed.error);

  try {
    const result = await canonicalExportService.export(parsed.data);
    return new Response(Buffer.from(result.content), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.byteLength),
        "Content-Type": result.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return errorResponse(error instanceof ExportError
      ? error
      : new ExportError("RENDER_FAILED", "The export could not be generated.", 500));
  }
}

function errorResponse(error: ExportError) {
  return NextResponse.json({
    ok: false,
    error: { code: error.code, message: error.message, recoverable: error.recoverable }
  }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
}
