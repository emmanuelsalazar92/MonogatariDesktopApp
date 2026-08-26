import { NextResponse } from "next/server";
import { createRelationship } from "@/lib/db/studio";
import type { Relationship } from "@/lib/studio-domain";

const relationshipCategories = new Set([
  "Family",
  "Romance",
  "Social",
  "Conflict",
  "Secret/Spoiler"
]);

const relationshipDirections = new Set(["Directional", "Bidirectional"]);

function isRelationshipCategory(value: unknown): value is Relationship["category"] {
  return typeof value === "string" && relationshipCategories.has(value);
}

function isRelationshipDirection(value: unknown): value is Relationship["direction"] {
  return typeof value === "string" && relationshipDirections.has(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    novelId?: unknown;
    fromCharacterId?: unknown;
    toCharacterId?: unknown;
    relationshipType?: unknown;
    category?: unknown;
    direction?: unknown;
    description?: unknown;
    isSpoiler?: unknown;
    status?: unknown;
    since?: unknown;
    notes?: unknown;
  };

  if (typeof body.novelId !== "string" || body.novelId.trim().length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  if (typeof body.fromCharacterId !== "string" || body.fromCharacterId.trim().length === 0) {
    return NextResponse.json({ error: "fromCharacterId is required" }, { status: 400 });
  }

  if (typeof body.toCharacterId !== "string" || body.toCharacterId.trim().length === 0) {
    return NextResponse.json({ error: "toCharacterId is required" }, { status: 400 });
  }

  if (
    typeof body.relationshipType !== "string" ||
    body.relationshipType.trim().length === 0
  ) {
    return NextResponse.json({ error: "relationshipType is required" }, { status: 400 });
  }

  if (!isRelationshipCategory(body.category)) {
    return NextResponse.json({ error: "category is invalid" }, { status: 400 });
  }

  if (body.direction !== undefined && !isRelationshipDirection(body.direction)) {
    return NextResponse.json({ error: "direction is invalid" }, { status: 400 });
  }

  const relationship = await createRelationship({
    novelId: body.novelId.trim(),
    fromCharacterId: body.fromCharacterId.trim(),
    toCharacterId: body.toCharacterId.trim(),
    relationshipType: body.relationshipType.trim(),
    category: body.category,
    direction: isRelationshipDirection(body.direction) ? body.direction : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    isSpoiler: typeof body.isSpoiler === "boolean" ? body.isSpoiler : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    since: typeof body.since === "string" ? body.since : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined
  });

  return NextResponse.json(relationship, { status: 201 });
}

