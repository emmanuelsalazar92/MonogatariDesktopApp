function isLocalNetworkHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]") return true;

  const ipv4 = normalized.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [first, second] = ipv4.map(Number);
    return first === 127 || first === 10 || first === 169 && second === 254 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
  }

  const ipv6 = normalized.replace(/^\[|\]$/g, "");
  return ipv6 === "::1" || /^f[cd][0-9a-f:]*$/.test(ipv6) || /^fe[89ab][0-9a-f:]*$/.test(ipv6);
}

function configuredOrigins() {
  return new Set(
    (process.env.MONOGATARI_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

// Next may build request.url from its bind address (for example localhost or
// 0.0.0.0), rather than from the Host header sent by a LAN browser. A browser
// cannot forge Host or Origin for a same-origin request, so compare them when
// the exposed host is a literal local-network address. Named proxy hosts must
// be explicitly configured; forwarded headers are never trusted here.
function isTrustedCanonicalizedLocalOrigin(request: Request, origin: URL) {
  const host = request.headers.get("host")?.toLowerCase();
  try {
    return Boolean(
      host &&
      origin.host === host &&
      origin.port === new URL(request.url).port &&
      isLocalNetworkHost(origin.hostname)
    );
  } catch {
    return false;
  }
}

export function isTrustedMutationRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return true;

  try {
    const origin = new URL(rawOrigin);
    if (origin.origin !== rawOrigin) return false;
    if (origin.origin === new URL(request.url).origin) return true;
    return isTrustedCanonicalizedLocalOrigin(request, origin) || configuredOrigins().has(origin.origin);
  } catch {
    return false;
  }
}

// Kept for route compatibility. LAN and standard mutations share the same
// host-agnostic CSRF policy.
export const isTrustedLanMutationRequest = isTrustedMutationRequest;
