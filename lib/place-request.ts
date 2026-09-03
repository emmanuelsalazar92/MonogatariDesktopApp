import { isValidNovelRouteId } from "@/lib/studio-routes";

export function resolvePlaceNovelId(request: Request, bodyNovelId?: unknown):
  | { ok: true; novelId: string }
  | { ok: false; error: string; status: number } {
  const url = new URL(request.url);
  const queryNovelId = url.searchParams.get("novelId");
  const novelId = queryNovelId ?? bodyNovelId;
  if (typeof novelId !== "string" || !isValidNovelRouteId(novelId)) {
    return { ok: false, error: "A valid novelId is required", status: 400 };
  }
  if (bodyNovelId !== undefined && bodyNovelId !== novelId) {
    return { ok: false, error: "Novel context does not match the request", status: 409 };
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const source = new URL(referer);
      const match = /^\/novels\/([^/]+)(?:\/|$)/.exec(source.pathname);
      if (source.origin !== url.origin || (match && decodeURIComponent(match[1]) !== novelId)) {
        return { ok: false, error: "Novel context does not match the open workspace", status: 409 };
      }
    } catch {
      return { ok: false, error: "Invalid workspace context", status: 400 };
    }
  }
  return { ok: true, novelId };
}
