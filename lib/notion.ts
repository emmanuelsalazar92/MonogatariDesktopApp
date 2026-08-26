import "server-only";

const NOTION_API_VERSION = "2022-06-28";
const NOTION_TIMEOUT_MS = 10_000;

export type NotionConnectionResult =
  | {
      ok: true;
      pageId: string;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

function formatPageId(compactId: string) {
  const normalized = compactId.toLowerCase();
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20)
  ].join("-");
}

export function normalizeNotionPageId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compactId = trimmed.replaceAll("-", "");
  if (/^[0-9a-f]{32}$/i.test(compactId)) {
    return formatPageId(compactId);
  }

  const matches = [...trimmed.matchAll(/([0-9a-f]{32})(?=[/?#]|$)/gi)];
  const pageId = matches.at(-1)?.[1];
  return pageId ? formatPageId(pageId) : null;
}

export function isNotionConfigured() {
  return Boolean(process.env.NOTION_API_TOKEN?.trim());
}

function connectionError(
  status: number
): Pick<Extract<NotionConnectionResult, { ok: false }>, "code" | "message"> {
  if (status === 401) {
    return {
      code: "INVALID_TOKEN",
      message: "Notion rejected the server token. Check NOTION_API_TOKEN."
    };
  }

  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: "The Notion integration does not have permission to access this page."
    };
  }

  if (status === 404) {
    return {
      code: "PAGE_NOT_SHARED",
      message: "Notion could not find this page. Share it with the Monogatari integration and try again."
    };
  }

  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: "Notion is temporarily rate limiting requests. Try again shortly."
    };
  }

  return {
    code: "NOTION_ERROR",
    message: `Notion returned an unexpected ${status} response.`
  };
}

export async function testNotionConnection(rootPage: string): Promise<NotionConnectionResult> {
  const pageId = normalizeNotionPageId(rootPage);
  if (!pageId) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_PAGE",
      message: "Enter a valid Notion page URL or page ID."
    };
  }

  const token = process.env.NOTION_API_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      status: 503,
      code: "NOT_CONFIGURED",
      message: "Notion is not configured. Set NOTION_API_TOKEN on the server and restart Monogatari."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTION_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        ...connectionError(response.status)
      };
    }

    return {
      ok: true,
      pageId,
      message: "Connection successful. Monogatari can access this Notion page."
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: timedOut ? 504 : 503,
      code: timedOut ? "TIMEOUT" : "OFFLINE",
      message: timedOut
        ? "Notion did not respond in time. Try again."
        : "Notion is unavailable or this device is offline. Monogatari will continue using SQLite."
    };
  } finally {
    clearTimeout(timeout);
  }
}
