import { NextResponse } from "next/server";
import { parseCharacterPlaceRelationshipType } from "@/lib/character-place";
import {
  CharacterPlaceConflictError,
  linkCharacterPlace,
  listCharacterPlaces,
  unlinkCharacterPlace
} from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { resolvePlaceNovelId } from "@/lib/place-request";

function readLocationId(body: Record<string, unknown>) {
  return typeof body.locationId === "string" && isValidNovelRouteId(body.locationId) ? body.locationId : "";
}

async function readBody(request: Request) {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["locationId", "relationshipType", "novelId"].includes(key))) throw new SyntaxError("Invalid body");
  return value as Record<string, unknown>;
}

function requestScope(request: Request, novelId?: unknown) {
  // Older MD-97 clients omit context; both stored IDs still must belong to one novel.
  if (!new URL(request.url).searchParams.has("novelId") && novelId === undefined) return { ok: true as const, novelId: undefined };
  return resolvePlaceNovelId(request, novelId);
}

function errorResponse(error: unknown) {
  if (error instanceof CharacterPlaceConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  if (error && typeof error === "object" && "code" in error && ["P2034", "P2028"].includes(String(error.code))) return NextResponse.json({ error: "The relationship changed concurrently. Please retry." }, { status: 409 });
  return NextResponse.json({ error: "Could not load or update linked places" }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  try {
    const characterId = (await context.params).characterId;
    if (!isValidNovelRouteId(characterId)) return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
    const scope = requestScope(request);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    return NextResponse.json(await listCharacterPlaces(characterId, scope.novelId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  try {
    const characterId = (await context.params).characterId;
    if (!isValidNovelRouteId(characterId)) return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
    const body = await readBody(request);
    const scope = requestScope(request, body.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const locationId = readLocationId(body);
    if (!locationId) {
      return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    }
    const relationshipType = parseCharacterPlaceRelationshipType(body.relationshipType);
    if (!relationshipType) {
      return NextResponse.json({ error: "relationshipType is invalid" }, { status: 400 });
    }

    const result = await linkCharacterPlace(
      characterId,
      locationId,
      relationshipType,
      scope.novelId
    );
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  try {
    const characterId = (await context.params).characterId;
    if (!isValidNovelRouteId(characterId)) return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
    const body = await readBody(request);
    const scope = requestScope(request, body.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const locationId = readLocationId(body);
    if (!locationId) {
      return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    }

    return NextResponse.json(
      await unlinkCharacterPlace(characterId, locationId, scope.novelId)
    );
  } catch (error) {
    return errorResponse(error);
  }
}
