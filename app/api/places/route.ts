import { NextResponse } from "next/server";
import { createPlace, listPlaces } from "@/lib/db/places";
import { novelExistsForRoute } from "@/lib/db/studio";
import { validatePlaceMetadata } from "@/lib/place-metadata";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { placeErrorResponse } from "./errors";

export async function GET(request: Request) {
  const context = resolvePlaceNovelId(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    if (!(await novelExistsForRoute(context.novelId))) return NextResponse.json({ error: "Novel was not found" }, { status: 404 });
    return NextResponse.json(await listPlaces(context.novelId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return placeErrorResponse(error); }
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid place metadata" }, { status: 400 });
    const { novelId, ...metadata } = body as Record<string, unknown>;
    const context = resolvePlaceNovelId(request, novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    const validation = validatePlaceMetadata(metadata);
    if (!validation.ok) return NextResponse.json(validation, { status: 400 });
    return NextResponse.json(await createPlace(context.novelId, validation.data), { status: 201 });
  } catch (error) { return placeErrorResponse(error); }
}
