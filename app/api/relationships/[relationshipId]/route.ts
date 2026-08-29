import { NextResponse } from "next/server";
import { deleteRelationship } from "@/lib/db/studio";

export async function DELETE(_request: Request, context: { params: Promise<{ relationshipId: string }> }) {
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
