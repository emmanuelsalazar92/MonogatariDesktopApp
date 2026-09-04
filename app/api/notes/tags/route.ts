import { NextResponse } from "next/server";
import { mutateNoteTag } from "@/lib/db/note-tags";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { noteErrorResponse } from "../errors";

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const body = await request.json(), scope = resolvePlaceNovelId(request, body?.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    return NextResponse.json(await mutateNoteTag(scope.novelId, method, body), { status: method === "POST" ? 201 : 200 });
  } catch (error) { return noteErrorResponse(error); }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
