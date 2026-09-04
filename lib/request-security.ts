export function isTrustedMutationRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

// Next can canonicalize a LAN request URL to localhost while preserving its actual Host.
// Permit only same-origin browser requests to literal LAN/loopback hosts on the same port.
// Forwarded headers are intentionally not trusted. This is CSRF protection, not LAN authentication.
export function isTrustedLanMutationRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (isTrustedMutationRequest(request)) return true;
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (!origin || !host) return false;
  const isLocalHost = (hostname: string) => {
    if (hostname === "localhost" || hostname === "[::1]") return true;
    const parts = hostname.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
    const [a, b] = parts.map(Number);
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  };
  try {
    const source = new URL(origin), target = new URL(request.url);
    return source.origin === origin && source.host === host.toLowerCase() && source.protocol === target.protocol && source.port === target.port
      && isLocalHost(source.hostname) && isLocalHost(target.hostname);
  } catch { return false; }
}
