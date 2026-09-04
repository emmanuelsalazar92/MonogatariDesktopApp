import { NextResponse } from "next/server";
import { writeNote } from "@/lib/db/notes";
import { getNoteCatalog } from "@/lib/db/note-catalog";
import { decodePrivateNoteSearch, parseNoteFilters } from "@/lib/note-catalog";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { noteErrorResponse } from "./errors";
export async function GET(request: Request) {
  try {
    const scope = resolvePlaceNovelId(request);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const params = new URL(request.url).searchParams;
    // Note search can contain private body text: ignore URL input and accept only the local request header.
    params.delete("search");
    const filter = parseNoteFilters(params);
    filter.search = decodePrivateNoteSearch(request.headers.get("x-note-search"));
    return NextResponse.json(await getNoteCatalog(scope.novelId, filter), { headers: { "Cache-Control": "private, no-store", Vary: "X-Note-Search" } });
  } catch (error) { return noteErrorResponse(error); }
}
export async function POST(request: Request) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const body = await request.json(), scope = resolvePlaceNovelId(request, body?.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    return NextResponse.json(await writeNote(scope.novelId, body), { status: 201 });
  } catch (error) { return noteErrorResponse(error); }
}
