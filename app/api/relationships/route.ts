import { NextResponse } from "next/server";
import { createRelationship, listRelationshipSummaries, RelationshipConflictError } from "@/lib/db/studio";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { validateRelationshipInput } from "@/lib/character-relationship";
import { isTrustedLanMutationRequest } from "@/lib/request-security";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const novelId = params.get("novelId");
  const headers = { "Cache-Control": "private, no-store" };
  if (!novelId || !isValidNovelRouteId(novelId)) return NextResponse.json({ error: "Valid novelId is required" }, { status: 400, headers });
  const lifecycle = params.get("lifecycle");
  try {
    return NextResponse.json(await listRelationshipSummaries(novelId, params.get("spoilers") === "true", lifecycle === "all" || lifecycle === "archived" ? lifecycle : "active"), { headers });
  } catch { return NextResponse.json({ error: "Could not load relationships" }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  if (!isTrustedLanMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const validation = validateRelationshipInput(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  try {
    return NextResponse.json(await createRelationship(validation.data), { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An equivalent relationship already exists; edit it instead" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save relationship. Please retry." }, { status: 500 });
  }
}

