import { NextResponse } from "next/server";
import { changeNovelLifecycle, NovelLifecycleConflictError } from "@/lib/db/studio";
import type { NovelStatus } from "@/lib/studio-domain";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";

const novelStatuses = new Set<NovelStatus>([
  "Idea", "Planning", "Writing", "Revision", "Complete", "Archived"
]);

function readLifecycleRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["action", "expectedStatus", "confirmed"].includes(key))) return null;
  if ((body.action !== "archive" && body.action !== "restore") || body.confirmed !== true) return null;
  if (typeof body.expectedStatus !== "string" || !novelStatuses.has(body.expectedStatus as NovelStatus)) return null;
  if ((body.action === "archive" && body.expectedStatus === "Archived") || (body.action === "restore" && body.expectedStatus !== "Archived")) return null;
  return { action: body.action, expectedStatus: body.expectedStatus as NovelStatus } as const;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ novelId: string }> }
) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const { novelId } = await context.params;
  if (!isValidNovelRouteId(novelId)) {
    return NextResponse.json({ error: "Invalid novel id" }, { status: 400 });
  }
  const input = readLifecycleRequest(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "A confirmed, current lifecycle action is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await changeNovelLifecycle(novelId, input.action, input.expectedStatus));
  } catch (error) {
    if (error instanceof NovelLifecycleConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
