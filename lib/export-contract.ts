export const exportTypes = ["manuscript", "outline"] as const;
export const exportScopes = ["novel", "volume", "chapter", "scene"] as const;
export const exportFormats = ["markdown", "txt", "html"] as const;

export type ExportType = (typeof exportTypes)[number];
export type ExportScope = (typeof exportScopes)[number];
export type ExportFormat = (typeof exportFormats)[number];

export type ExportOptions = {
  includeMetadata: boolean;
  includeTableOfContents: boolean;
  includeSceneTitles: boolean;
};

export type ExportRequest = {
  novelId: string;
  exportType: ExportType;
  scope: ExportScope;
  scopeId: string | null;
  format: ExportFormat;
  options: ExportOptions;
};

export type ExportResult = {
  filename: string;
  contentType: string;
  byteLength: number;
  content: Uint8Array;
};

export type ExportErrorCode =
  | "INVALID_REQUEST"
  | "NOVEL_NOT_FOUND"
  | "SCOPE_NOT_FOUND"
  | "UNSUPPORTED_FORMAT"
  | "RENDER_FAILED"
  | "ARTIFACT_FAILED";

export class ExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode,
    message: string,
    public readonly status: number,
    public readonly recoverable = true
  ) {
    super(message);
    this.name = "ExportError";
  }
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);

const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && values.includes(value as T);

export function readExportRequest(value: unknown):
  | { ok: true; data: ExportRequest }
  | { ok: false; error: ExportError } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Export request must be an object.");
  }
  const source = value as Record<string, unknown>;
  const requestKeys = ["novelId", "exportType", "scope", "scopeId", "format", "options"] as const;
  if (Object.keys(source).some((key) => !requestKeys.includes(key as typeof requestKeys[number]))) {
    return invalid("Export request contains unsupported fields.");
  }
  if (!validId(source.novelId)) return invalid("A valid novelId is required.");
  if (!includes(exportTypes, source.exportType)) return invalid("Unsupported export type.");
  if (!includes(exportScopes, source.scope)) return invalid("Unsupported export scope.");
  if (!includes(exportFormats, source.format)) return invalid("Unsupported export format.");

  const scopeId = source.scopeId ?? null;
  if (source.scope === "novel" ? scopeId !== null : !validId(scopeId)) {
    return invalid(source.scope === "novel"
      ? "Novel exports do not accept a scopeId."
      : "This export scope requires a valid scopeId.");
  }

  const rawOptions = source.options;
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    return invalid("Export options are required.");
  }
  const options = rawOptions as Record<string, unknown>;
  const optionKeys = ["includeMetadata", "includeTableOfContents", "includeSceneTitles"] as const;
  if (
    Object.keys(options).some((key) => !optionKeys.includes(key as typeof optionKeys[number])) ||
    optionKeys.some((key) => typeof options[key] !== "boolean")
  ) return invalid("Export options contain unsupported values.");

  return {
    ok: true,
    data: {
      novelId: source.novelId,
      exportType: source.exportType,
      scope: source.scope,
      scopeId: scopeId as string | null,
      format: source.format,
      options: {
        includeMetadata: options.includeMetadata as boolean,
        includeTableOfContents: options.includeTableOfContents as boolean,
        includeSceneTitles: options.includeSceneTitles as boolean
      }
    }
  };
}

function invalid(message: string) {
  return {
    ok: false as const,
    error: new ExportError("INVALID_REQUEST", message, 400)
  };
}
