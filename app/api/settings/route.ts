import { NextResponse } from "next/server";
import { updateStudioSettings } from "@/lib/db/studio";

export async function PATCH(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  try {
    return NextResponse.json(await updateStudioSettings(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid settings" },
      { status: 400 }
    );
  }
}
