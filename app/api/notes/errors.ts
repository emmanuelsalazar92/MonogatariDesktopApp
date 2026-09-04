import { NextResponse } from "next/server";
import { NoteError } from "@/lib/db/notes";
export function noteErrorResponse(error: unknown) {
  if (error instanceof NoteError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  return NextResponse.json({ error: "Could not update Notes" }, { status: 500 });
}
