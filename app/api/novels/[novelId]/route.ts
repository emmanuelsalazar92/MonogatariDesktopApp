import { NextResponse } from "next/server";

import { updateNovelMetadata } from "@/lib/db/studio";
import { validateNovelMetadata } from "@/lib/novel-metadata";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export async function PATCH(request: Request, context: { params: Promise<{ novelId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { novelId } = await context.params;
  if (!isValidNovelRouteId(novelId)) {
    return NextResponse.json({ error: "Invalid novel id" }, { status: 400 });
  }

  const validation = validateNovelMetadata(await request.json().catch(() => null));
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });

  try {
    return NextResponse.json(await updateNovelMetadata(novelId, validation.data));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Novel was not found" }, { status: 404 });
    }
    throw error;
  }
}
