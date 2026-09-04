import { NextResponse } from "next/server";
import { TimelinePlaceError } from "@/lib/db/timeline-places";

export function timelineErrorResponse(error: unknown) {
  if (error instanceof TimelinePlaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "P2034" || code === "P2028" || code === "SQLITE_BUSY") {
    return NextResponse.json({ error: "Timeline changed concurrently. Please retry." }, { status: 409 });
  }
  return NextResponse.json({ error: "Could not update Timeline" }, { status: 500 });
}
