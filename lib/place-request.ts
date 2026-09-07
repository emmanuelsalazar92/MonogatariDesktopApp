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
      // Next can canonicalize request.url to its bind address (such as
      // localhost) even though the browser reached this instance through its
      // LAN address or a proxy hostname. Host is the externally requested
      // authority; use it only as a same-instance fallback for this workspace
      // path check. Entity ownership is still enforced by the database query.
      const requestHost = request.headers.get("host")?.toLowerCase();
      const sameInstance = source.origin === url.origin || Boolean(requestHost && source.host === requestHost);
      if (!sameInstance || (match && decodeURIComponent(match[1]) !== novelId)) {
        return { ok: false, error: "Novel context does not match the open workspace", status: 409 };
      }
    } catch {
      return { ok: false, error: "Invalid workspace context", status: 400 };
    }
  }
  return { ok: true, novelId };
}
