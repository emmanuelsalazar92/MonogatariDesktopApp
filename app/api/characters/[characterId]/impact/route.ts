import { NextResponse } from "next/server";
import {
  CharacterLifecycleConflictError,
  getCharacterDeleteImpact
} from "@/lib/db/studio";

export async function GET(
  _request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await context.params;
  if (!characterId.trim()) {
    return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getCharacterDeleteImpact(characterId));
  } catch (error) {
    if (error instanceof CharacterLifecycleConflictError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
