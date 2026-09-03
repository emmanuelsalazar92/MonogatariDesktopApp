import { NextResponse } from "next/server";
import { archiveCharacter } from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ characterId: string }> }
) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { characterId } = await context.params;
  if (!characterId.trim()) {
    return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await archiveCharacter(characterId));
  } catch (error) {
    if (isNotFound(error)) {
      return NextResponse.json({ error: "character not found" }, { status: 404 });
    }
    throw error;
  }
}
