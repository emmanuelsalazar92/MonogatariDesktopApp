import { NextResponse } from "next/server";
import { getStudioSnapshot } from "@/lib/db/studio";

export async function GET() {
  const snapshot = await getStudioSnapshot();
  return NextResponse.json(snapshot);
}
