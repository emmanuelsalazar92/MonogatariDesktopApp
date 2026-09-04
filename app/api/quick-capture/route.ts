import { NextResponse } from "next/server";
import { validateCharacterMetadata } from "@/lib/character-metadata";
import { createCharacter, sceneBelongsToNovel } from "@/lib/db/studio";
import { createPlace } from "@/lib/db/places";
import { validatePlaceMetadata } from "@/lib/place-metadata";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export async function POST(request: Request) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ error: "Invalid quick capture" }, { status: 400 });
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(key => !["novelId", "sceneId", "kind", "name"].includes(key)) ||
      typeof body.novelId !== "string" || !isValidNovelRouteId(body.novelId) || typeof body.sceneId !== "string" || !isValidNovelRouteId(body.sceneId) || !["Character", "Place"].includes(body.kind as string) || typeof body.name !== "string") {
      return NextResponse.json({ error: "Invalid quick capture" }, { status: 400 });
    }
    const novelId = body.novelId as string, sceneId = body.sceneId as string;
    if (!await sceneBelongsToNovel(sceneId, novelId)) return NextResponse.json({ error: "Scene was not found in this novel" }, { status: 404 });
    if (body.kind === "Character") {
      const metadata = validateCharacterMetadata({ name: body.name });
      if (!metadata.ok) return NextResponse.json(metadata, { status: 400 });
      // Quick capture is local-only; it must not enqueue an external sync.
      return NextResponse.json(await createCharacter({ novelId, metadata: metadata.data, markExternalDirty: false }), { status: 201 });
    }
    const metadata = validatePlaceMetadata({ name: body.name });
    if (!metadata.ok) return NextResponse.json(metadata, { status: 400 });
    return NextResponse.json(await createPlace(novelId, metadata.data), { status: 201 });
  } catch { return NextResponse.json({ error: "Could not create the selected story entity" }, { status: 500 }); }
}
