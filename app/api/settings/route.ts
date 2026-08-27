import { NextResponse } from "next/server";
import { StudioSettingsValidationError, updateStudioSettings } from "@/lib/db/studio";

const safeSaveError = "Settings could not be saved. Your previous configuration is still active.";

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: safeSaveError }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: safeSaveError }, { status: 400 });
  }

  try {
    return NextResponse.json(await updateStudioSettings(body as Record<string, unknown>));
  } catch (error) {
    return NextResponse.json(
      { error: safeSaveError },
      { status: error instanceof StudioSettingsValidationError ? 400 : 500 }
    );
  }
}
