import { NextResponse } from "next/server";
import {
  linkCharacterScene,
  listCharacterScenes,
  SceneCharacterConflictError,
  unlinkCharacterScene
} from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";

function readSceneId(body: Record<string, unknown>) {
  return typeof body.sceneId === "string" ? body.sceneId.trim() : "";
}

function errorResponse(error: unknown) {
  if (error instanceof SceneCharacterConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  throw error;
}

export async function GET(_request: Request, context: { params: Promise<{ characterId: string }> }) {
  try {
    return NextResponse.json(await listCharacterScenes((await context.params).characterId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ characterId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const sceneId = readSceneId((await request.json()) as Record<string, unknown>);
  if (!sceneId) return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
  try {
    const result = await linkCharacterScene((await context.params).characterId, sceneId);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ characterId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const sceneId = readSceneId((await request.json()) as Record<string, unknown>);
  if (!sceneId) return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
  try {
    return NextResponse.json(await unlinkCharacterScene((await context.params).characterId, sceneId));
  } catch (error) {
    return errorResponse(error);
  }
}
