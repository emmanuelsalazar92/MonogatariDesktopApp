import { NextResponse } from "next/server";
import { setPlaceArchived } from "@/lib/db/places";
import { readPlaceLifecycleConfirmation } from "@/lib/place-lifecycle";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidPlaceRouteId } from "@/lib/studio-routes";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { placeErrorResponse } from "./errors";

export async function changePlaceLifecycle(request: Request, placeId: string, archived: boolean) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  try {
    const body: unknown = await request.json();
    const confirmation = readPlaceLifecycleConfirmation(body);
    if (!confirmation) return NextResponse.json({ error: "Confirmation and current revision are required" }, { status: 400 });
    const context = resolvePlaceNovelId(request, (body as Record<string, unknown>).novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json(await setPlaceArchived(context.novelId, placeId, confirmation.revision, archived));
  } catch (error) { return placeErrorResponse(error); }
}
