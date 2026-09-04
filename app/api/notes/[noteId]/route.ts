import { NextResponse } from "next/server";
import { getNote, writeNote, deleteNote } from "@/lib/db/notes";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { noteErrorResponse } from "../errors";
type Context = { params: Promise<{ noteId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { noteId } = await context.params, scope = resolvePlaceNovelId(request);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (!isValidNovelRouteId(noteId)) return NextResponse.json({ error: "Invalid Note ID" }, { status: 400 });
    const note = await getNote(scope.novelId, noteId);
    return NextResponse.json(note ?? { error: "Note unavailable" }, { status: note ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return noteErrorResponse(error); }
}
async function mutate(request: Request, context: Context, deleting: boolean) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const { noteId } = await context.params, body = await request.json(), scope = resolvePlaceNovelId(request, body?.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (!isValidNovelRouteId(noteId) || !body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger(body.revision) || body.revision < 0) return NextResponse.json({ error: "Note ID and current revision are required" }, { status: 400 });
    if (deleting && (body.confirmed !== true || Object.keys(body).some(key => !["novelId", "revision", "confirmed"].includes(key)))) return NextResponse.json({ error: "Delete confirmation is required" }, { status: 400 });
    return NextResponse.json(deleting ? await deleteNote(scope.novelId, noteId, body.revision) : await writeNote(scope.novelId, body, noteId, body.revision));
  } catch (error) { return noteErrorResponse(error); }
}
export const PATCH = (request: Request, context: Context) => mutate(request, context, false);
export const DELETE = (request: Request, context: Context) => mutate(request, context, true);
