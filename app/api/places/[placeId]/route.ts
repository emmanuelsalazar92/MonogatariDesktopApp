import { NextResponse } from "next/server";
import { deletePlace, getPlace, updatePlace } from "@/lib/db/places";
import { readPlaceDeleteConfirmation } from "@/lib/place-lifecycle";
import { validatePlaceMetadata } from "@/lib/place-metadata";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidPlaceRouteId } from "@/lib/studio-routes";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { placeErrorResponse } from "../errors";

type Context = { params: Promise<{ placeId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  const context = resolvePlaceNovelId(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    return NextResponse.json(await getPlace(context.novelId, placeId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return placeErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid place metadata" }, { status: 400 });
    const { novelId, revision, ...metadata } = body as Record<string, unknown>;
    const context = resolvePlaceNovelId(request, novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
      return NextResponse.json({ error: "The current place revision is required" }, { status: 400 });
    }
    const validation = validatePlaceMetadata(metadata, true);
    if (!validation.ok) return NextResponse.json(validation, { status: 400 });
    return NextResponse.json(await updatePlace(context.novelId, placeId, revision as number, validation.data));
  } catch (error) { return placeErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  try {
    const body: unknown = await request.json();
    const confirmation = readPlaceDeleteConfirmation(body);
    if (!confirmation) return NextResponse.json({ error: "Explicit confirmation with the reviewed revision and impact is required" }, { status: 400 });
    const context = resolvePlaceNovelId(request, (body as Record<string, unknown>).novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json(await deletePlace(context.novelId, placeId, confirmation));
  } catch (error) { return placeErrorResponse(error); }
}
