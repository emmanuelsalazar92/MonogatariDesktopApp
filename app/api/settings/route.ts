import { NextResponse } from "next/server";
import { updateAppSettings } from "@/lib/db/studio";

export async function PATCH(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const entries = Object.entries(body).filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0
  );

  if (entries.length === 0) {
    return NextResponse.json({ error: "at least one string setting is required" }, { status: 400 });
  }

  const settings = await updateAppSettings(
    Object.fromEntries(
      entries.map(([key, value]) => [key, (value as string).trim()])
    )
  );

  return NextResponse.json(settings);
}
