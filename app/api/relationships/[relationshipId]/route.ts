import { NextResponse } from "next/server";
import { changeRelationshipLifecycle, updateRelationship, getRelationshipDetail, RelationshipConflictError } from "@/lib/db/studio";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { validateRelationshipInput } from "@/lib/character-relationship";
import { isTrustedLanMutationRequest } from "@/lib/request-security";

export async function GET(request: Request, context: { params: Promise<{ relationshipId: string }> }) {
  const { relationshipId } = await context.params;
  const params = new URL(request.url).searchParams, novelId = params.get("novelId");
  const headers = { "Cache-Control": "private, no-store" };
  if (!novelId || !isValidNovelRouteId(novelId) || !isValidNovelRouteId(relationshipId)) return NextResponse.json({ error: "Invalid IDs" }, { status: 400, headers });
  try {
    const relationship = await getRelationshipDetail(novelId, relationshipId, params.get("spoilers") === "true");
    // Hidden and missing records are indistinguishable, including their response body.
    return relationship ? NextResponse.json(relationship, { headers }) : NextResponse.json({ error: "Relationship unavailable" }, { status: 404, headers });
  } catch { return NextResponse.json({ error: "Could not load relationship" }, { status: 500, headers }); }
}

async function mutate(request: Request, context: { params: Promise<{ relationshipId: string }> }, deleting: boolean) {
  if (!isTrustedLanMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { relationshipId } = await context.params;
  const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
  if (!validId(relationshipId)) return NextResponse.json({ error: "Invalid relationship ID" }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !validId(body.novelId) || !Number.isSafeInteger(body.revision) || body.revision < 0) {
    return NextResponse.json({ error: "Novel and current revision are required" }, { status: 400 });
  }
  const { action, revision, ...input } = body;
  try {
    if (!deleting && action === "edit") {
      const validation = validateRelationshipInput(input);
      if (!validation.ok) return NextResponse.json(validation, { status: 400 });
      return NextResponse.json(await updateRelationship(relationshipId, revision, validation.data));
    }
    if ((deleting ? action !== "delete" : action !== "archive" && action !== "restore") || body.confirmed !== true || Object.keys(input).some((key) => !["novelId", "confirmed"].includes(key))) {
      return NextResponse.json({ error: "Invalid or unconfirmed action" }, { status: 400 });
    }
    return NextResponse.json(await changeRelationshipLifecycle(relationshipId, body.novelId, revision, action));
  } catch (error) {
    if (error instanceof RelationshipConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Could not update relationship. Please retry." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ relationshipId: string }> }) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: { params: Promise<{ relationshipId: string }> }) { return mutate(request, context, true); }
