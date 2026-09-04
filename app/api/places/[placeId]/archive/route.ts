import { changePlaceLifecycle } from "../../lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  return changePlaceLifecycle(request, (await params).placeId, true);
}
