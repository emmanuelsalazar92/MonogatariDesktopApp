import { NextResponse } from "next/server";
import { deleteRelationship } from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";

export async function DELETE(request: Request, context: { params: Promise<{ relationshipId: string }> }) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { relationshipId } = await context.params;
  if (!relationshipId.trim()) return NextResponse.json({ error: "relationshipId is required" }, { status: 400 });
  try {
    return NextResponse.json(await deleteRelationship(relationshipId));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "relationship not found" }, { status: 404 });
    }
    throw error;
  }
}
