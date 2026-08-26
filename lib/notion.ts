import "server-only";

const NOTION_API_VERSION = "2026-03-11";
const NOTION_TIMEOUT_MS = 10_000;
const NOTION_API_URL = "https://api.notion.com";

export type NotionConnectionResult =
  | { ok: true; pageId: string; pageTitle: string; message: string }
  | { ok: false; status: number; code: string; message: string };

type NotionPage = {
  id: string;
  parent?: { type?: string; page_id?: string };
  properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>;
};

export class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterMs: number | null = null
  ) {
    super(message);
  }
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
}

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
  if (/^[0-9a-f]{32}$/i.test(compactId)) return formatPageId(compactId);

  const matches = [...trimmed.matchAll(/([0-9a-f]{32})(?=[/?#]|$)/gi)];
  const pageId = matches.at(-1)?.[1];
  return pageId ? formatPageId(pageId) : null;
}

export function isNotionConfigured() {
  return Boolean(process.env.NOTION_API_TOKEN?.trim());
}

function connectionError(status: number) {
  if (status === 401) {
    return { code: "INVALID_TOKEN", message: "Notion authentication failed on the server. Ask an administrator to verify the integration." };
  }
  if (status === 403) {
    return { code: "FORBIDDEN", message: "The Notion integration does not have permission to access this page." };
  }
  if (status === 404) {
    return { code: "PAGE_NOT_SHARED", message: "Notion could not find this page. Share it with the Monogatari integration and try again." };
  }
  if (status === 429) {
    return { code: "RATE_LIMITED", message: "Notion is temporarily rate limiting requests. Try again shortly." };
  }
  return { code: "NOTION_ERROR", message: "Notion could not complete the request. Try again." };
}

function pageTitle(page: NotionPage) {
  const titleProperty = Object.values(page.properties ?? {}).find(
    (property) => property.type === "title" || Array.isArray(property.title)
  );
  const title = titleProperty?.title
    ?.map((item) => item.plain_text ?? "")
    .join("")
    .trim();
  return (title || "Authorized Notion page").slice(0, 500);
}

export async function requestNotion<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}
) {
  const token = process.env.NOTION_API_TOKEN?.trim();
  if (!token) {
    throw new NotionApiError(
      503,
      "NOT_CONFIGURED",
      "The Notion integration is not configured on this server."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${NOTION_API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const details = connectionError(response.status);
      throw new NotionApiError(
        response.status,
        details.code,
        details.message,
        response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : null
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof NotionApiError) throw error;

    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new NotionApiError(
      timedOut ? 504 : 503,
      timedOut ? "TIMEOUT" : "OFFLINE",
      timedOut
        ? "Notion did not respond in time. Try again."
        : "Notion is unavailable or this device is offline. Monogatari will continue using SQLite."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function testNotionConnection(rootPage: string): Promise<NotionConnectionResult> {
  const pageId = normalizeNotionPageId(rootPage);
  if (!pageId) {
    return { ok: false, status: 400, code: "INVALID_PAGE", message: "Enter a valid Notion page URL or page ID." };
  }

  try {
    const page = await requestNotion<NotionPage>(`/v1/pages/${pageId}`);
    const title = pageTitle(page);
    return {
      ok: true,
      pageId,
      pageTitle: title,
      message: `Connected to ${title}. Monogatari can access this Notion page.`
    };
  } catch (error) {
    if (error instanceof NotionApiError) {
      return { ok: false, status: error.status, code: error.code, message: error.message };
    }
    return {
      ok: false,
      status: 503,
      code: "OFFLINE",
      message: "Notion is unavailable or this device is offline. Monogatari will continue using SQLite."
    };
  }
}

export async function assertNotionPageWithinRoot(pageId: string, rootPageId: string) {
  const normalizedRootPageId = normalizeNotionPageId(rootPageId);
  const normalizedPageId = normalizeNotionPageId(pageId);
  if (!normalizedRootPageId || !normalizedPageId) {
    throw new NotionApiError(400, "INVALID_PAGE", "The configured Notion page is invalid.");
  }
  let currentPageId: string = normalizedPageId;

  const visited = new Set<string>();
  for (let depth = 0; depth < 32; depth += 1) {
    if (visited.has(currentPageId)) break;
    visited.add(currentPageId);

    const page = await requestNotion<NotionPage>(`/v1/pages/${currentPageId}`);
    if (currentPageId === normalizedRootPageId) return;
    const parentId = page.parent?.type === "page_id" ? normalizeNotionPageId(page.parent.page_id ?? "") : null;
    if (!parentId) break;
    currentPageId = parentId;
  }

  throw new NotionApiError(
    403,
    "ROOT_BOUNDARY_VIOLATION",
    "The requested Notion page is outside the authorized root page."
  );
}
