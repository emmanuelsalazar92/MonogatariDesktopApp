import { NextResponse } from "next/server";
import { getPlaceDeleteImpact } from "@/lib/db/places";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidPlaceRouteId } from "@/lib/studio-routes";
import { placeErrorResponse } from "../../errors";

export async function GET(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  const context = resolvePlaceNovelId(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try { return NextResponse.json(await getPlaceDeleteImpact(context.novelId, placeId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return placeErrorResponse(error); }
}
