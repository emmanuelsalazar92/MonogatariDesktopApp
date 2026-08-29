import { NextResponse } from "next/server";
import { createCharacter } from "@/lib/db/studio";
import { validateCharacterMetadata } from "@/lib/character-metadata";

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  if (typeof body.novelId !== "string" || body.novelId.trim().length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  const validation = validateCharacterMetadata(body);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });

  const character = await createCharacter({
    novelId: body.novelId.trim(),
    metadata: validation.data
  });

  return NextResponse.json(character, { status: 201 });
}
