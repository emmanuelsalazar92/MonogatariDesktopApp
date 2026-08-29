import { NextResponse } from "next/server";
import { updateCharacter } from "@/lib/db/studio";
import { validateCharacterMetadata } from "@/lib/character-metadata";

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function PATCH(request: Request, context: { params: Promise<{ characterId: string }> }) {
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
