import { NextResponse } from "next/server";
import { createCharacter } from "@/lib/db/studio";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    novelId?: unknown;
    name?: unknown;
    notes?: unknown;
  };

  if (typeof body.novelId !== "string" || body.novelId.trim().length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const character = await createCharacter({
    novelId: body.novelId.trim(),
    name: body.name.trim(),
    notes: typeof body.notes === "string" ? body.notes : undefined
  });

  return NextResponse.json(character, { status: 201 });
}
