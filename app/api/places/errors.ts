import { NextResponse } from "next/server";
import { PlaceError } from "@/lib/db/places";

export function placeErrorResponse(error: unknown) {
  if (error instanceof PlaceError) return NextResponse.json({ error: error.message, code: error.code, impact: error.impact }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  if (error && typeof error === "object" && "code" in error && ["P2034", "P2028"].includes(String(error.code))) {
    return NextResponse.json({ error: "Place changed concurrently. Reload and try again.", code: "STALE_REVISION" }, { status: 409 });
  }
  return NextResponse.json({ error: "Could not save or load this place. Please try again." }, { status: 500 });
}
