import { NextResponse } from "next/server";
import {
  CharacterLifecycleConflictError,
  deleteCharacter,
  getCharacterDetail,
  updateCharacter
} from "@/lib/db/studio";
import { validateCharacterMetadata } from "@/lib/character-metadata";
import { isTrustedMutationRequest } from "@/lib/request-security";

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function PATCH(request: Request, context: { params: Promise<{ characterId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { characterId } = await context.params;
  if (!characterId.trim()) return NextResponse.json({ error: "characterId is required" }, { status: 400 });

  const body = await request.json() as Record<string, unknown>;
  if ("novelId" in body) return NextResponse.json({ error: "Fields are not editable: novelId" }, { status: 400 });
  const validation = validateCharacterMetadata(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });

  try {
    return NextResponse.json(await updateCharacter(characterId, validation.data));
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "character not found" }, { status: 404 });
    throw error;
  }
}

export async function GET(request: Request, context: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await context.params;
  const novelId = new URL(request.url).searchParams.get("novelId")?.trim() ?? "";
  if (!characterId.trim() || !novelId) {
    return NextResponse.json({ error: "novelId and characterId are required" }, { status: 400 });
  }
  const character = await getCharacterDetail(novelId, characterId);
  return character
    ? NextResponse.json(character)
    : NextResponse.json({ error: "character not found" }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: Promise<{ characterId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { characterId } = await context.params;
  if (!characterId.trim()) {
    return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const impact = body?.impact as Record<string, unknown> | undefined;
  const counts = impact
    ? [impact.linkedScenes, impact.linkedPlaces, impact.relationships]
    : [];
  if (
    body?.confirmed !== true ||
    counts.length !== 3 ||
    counts.some((count) => !Number.isInteger(count) || (count as number) < 0)
  ) {
    return NextResponse.json(
      { error: "Explicit confirmation with the reviewed impact is required" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await deleteCharacter(characterId, {
        linkedScenes: impact!.linkedScenes as number,
        linkedPlaces: impact!.linkedPlaces as number,
        relationships: impact!.relationships as number
      })
    );
  } catch (error) {
    if (error instanceof CharacterLifecycleConflictError) {
      return NextResponse.json(
        { error: error.message, impact: error.impact },
        { status: error.message === "Character was not found" ? 404 : 409 }
      );
    }
    if (isNotFound(error)) {
      return NextResponse.json({ error: "character not found" }, { status: 404 });
    }
    throw error;
  }
}
