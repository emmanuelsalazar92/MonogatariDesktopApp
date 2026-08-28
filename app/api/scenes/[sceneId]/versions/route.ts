import { NextResponse } from "next/server";
import { createSceneVersion, listSceneVersions } from "@/lib/db/studio";

export async function GET(_request: Request, context: { params: Promise<{ sceneId: string }> }) {
  try { return NextResponse.json(await listSceneVersions((await context.params).sceneId)); }
  catch { return NextResponse.json({ error: "scene not found" }, { status: 404 }); }
}

export async function POST(request: Request, context: { params: Promise<{ sceneId: string }> }) {
  const body = await request.json() as { label?: unknown };
  if (body.label !== undefined && (typeof body.label !== "string" || body.label.length > 120)) return NextResponse.json({ error: "label is invalid" }, { status: 400 });
  try { return NextResponse.json(await createSceneVersion((await context.params).sceneId, body.label ?? ""), { status: 201 }); }
  catch { return NextResponse.json({ error: "checkpoint could not be created" }, { status: 404 }); }
}
