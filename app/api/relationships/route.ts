import { NextResponse } from "next/server";
import { createRelationship, RelationshipConflictError } from "@/lib/db/studio";
import { validateRelationshipInput } from "@/lib/character-relationship";
import { isTrustedMutationRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const validation = validateRelationshipInput(await request.json());
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  try {
    return NextResponse.json(await createRelationship(validation.data), { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An equivalent relationship already exists; edit it instead" }, { status: 409 });
    }
    throw error;
  }
}

