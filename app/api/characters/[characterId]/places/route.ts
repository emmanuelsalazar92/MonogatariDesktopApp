import { NextResponse } from "next/server";
import { parseCharacterPlaceRelationshipType } from "@/lib/character-place";
import {
  CharacterPlaceConflictError,
  linkCharacterPlace,
  listCharacterPlaces,
  unlinkCharacterPlace
} from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";

function readLocationId(body: Record<string, unknown>) {
  return typeof body.locationId === "string" ? body.locationId.trim() : "";
}

function errorResponse(error: unknown) {
  if (error instanceof CharacterPlaceConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  throw error;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  try {
    return NextResponse.json(await listCharacterPlaces((await context.params).characterId));
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
  const body = (await request.json()) as Record<string, unknown>;
  const locationId = readLocationId(body);
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const relationshipType = parseCharacterPlaceRelationshipType(body.relationshipType);
  if (!relationshipType) {
    return NextResponse.json({ error: "relationshipType is invalid" }, { status: 400 });
  }

  try {
    const result = await linkCharacterPlace(
      (await context.params).characterId,
      locationId,
      relationshipType
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
  const locationId = readLocationId((await request.json()) as Record<string, unknown>);
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await unlinkCharacterPlace((await context.params).characterId, locationId)
    );
  } catch (error) {
    return errorResponse(error);
  }
}
