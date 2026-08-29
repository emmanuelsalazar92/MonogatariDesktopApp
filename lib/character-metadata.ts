import type { Character } from "@/lib/studio-domain";

export const characterRoles = ["Protagonist", "Antagonist", "Support", "Minor", "Cameo", "Other"] as const;
export const characterStatuses = ["Active", "Inactive", "Archived"] as const;
export const legacyNarrativeStatuses = ["Secondary", "Missing", "Deceased", "Spoiler"] as const;

export type CharacterRole = (typeof characterRoles)[number];
export type CharacterLifecycleStatus = (typeof characterStatuses)[number];
export type CharacterNarrativeStatus = (typeof legacyNarrativeStatuses)[number] | "";

const legacyRoleMap: Record<string, CharacterRole> = {
  Deuteragonist: "Support",
  "Mentor / Suspect": "Other"
};

const legacyNarrativeMap: Record<string, CharacterNarrativeStatus> = {
  Secondary: "Secondary",
  Missing: "Missing",
  Dead: "Deceased",
  Deceased: "Deceased",
  Spoiler: "Spoiler"
};

export function normalizeStoredCharacterRole(value: string): CharacterRole {
  if (characterRoles.includes(value as CharacterRole)) return value as CharacterRole;
  return legacyRoleMap[value] ?? "Other";
}

export function parseStoredCharacterStatus(value: string): {
  lifecycle: CharacterLifecycleStatus;
  narrative: CharacterNarrativeStatus;
} {
  try {
    const parsed = JSON.parse(value) as { lifecycle?: unknown; narrative?: unknown };
    const lifecycle = characterStatuses.includes(parsed.lifecycle as CharacterLifecycleStatus)
      ? parsed.lifecycle as CharacterLifecycleStatus
      : "Active";
    const narrative = legacyNarrativeStatuses.includes(parsed.narrative as Exclude<CharacterNarrativeStatus, "">)
      ? parsed.narrative as CharacterNarrativeStatus
      : "";
    return { lifecycle, narrative };
  } catch {
    if (characterStatuses.includes(value as CharacterLifecycleStatus)) {
      return { lifecycle: value as CharacterLifecycleStatus, narrative: "" };
    }
    return { lifecycle: "Active", narrative: legacyNarrativeMap[value] ?? "" };
  }
}

export function serializeCharacterStatus(lifecycle: CharacterLifecycleStatus, narrative: CharacterNarrativeStatus = "") {
  return JSON.stringify({ lifecycle, ...(narrative ? { narrative } : {}) });
}

export function matchesCharacterClassification(
  character: Pick<Character, "role" | "status">,
  role: string,
  status: string
) {
  return (role === "All roles" || character.role === role) &&
    (status === "All statuses" || character.status === status);
}

export type CharacterMetadataInput = Pick<
  Character,
  | "name"
  | "aliases"
  | "role"
  | "status"
  | "age"
  | "appearance"
  | "personality"
  | "wayOfSpeaking"
  | "goal"
  | "fear"
  | "secret"
  | "notes"
>;

export type CharacterFieldErrors = Partial<Record<keyof CharacterMetadataInput | "novelId", string>>;

const limits: Record<keyof Omit<CharacterMetadataInput, "aliases" | "status" | "role">, number> = {
  name: 120,
  age: 80,
  appearance: 2_000,
  personality: 2_000,
  wayOfSpeaking: 2_000,
  goal: 2_000,
  fear: 2_000,
  secret: 5_000,
  notes: 10_000
};

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : null;
}

export function normalizeAliases(value: unknown, name = "") {
  if (!Array.isArray(value)) return [];
  const seen = new Set([name.normalize("NFC").trim().toLocaleLowerCase()]);
  const aliases: string[] = [];
  for (const item of value) {
    const alias = normalizedText(item);
    if (!alias) continue;
    const key = alias.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

export function parseStoredAliases(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeAliases(parsed);
  } catch {
    // Legacy rows stored one plain-text alias.
  }
  return normalizeAliases(value ? [value] : []);
}

export function validateCharacterMetadata(value: unknown):
  | { ok: true; data: CharacterMetadataInput }
  | { ok: false; error: string; fieldErrors: CharacterFieldErrors } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Invalid character metadata", fieldErrors: {} };
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set([...Object.keys(limits), "aliases", "role", "status", "novelId"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) {
    return { ok: false, error: `Fields are not editable: ${unknown.join(", ")}`, fieldErrors: {} };
  }

  const fieldErrors: CharacterFieldErrors = {};
  const text = {} as Record<keyof typeof limits, string>;
  for (const [field, limit] of Object.entries(limits) as [keyof typeof limits, number][]) {
    const normalized = normalizedText(input[field] ?? "");
    if (normalized === null) fieldErrors[field] = `${field} must be text`;
    else if (field === "name" && !normalized) fieldErrors.name = "Name is required";
    else if (normalized.length > limit) fieldErrors[field] = `${field} must be ${limit} characters or fewer`;
    else text[field] = normalized;
  }

  if (input.aliases !== undefined && !Array.isArray(input.aliases)) fieldErrors.aliases = "Aliases must be a list";
  const aliases = normalizeAliases(input.aliases ?? [], text.name ?? "");
  if (aliases.length > 20) fieldErrors.aliases = "Use 20 aliases or fewer";
  else if (aliases.some((alias) => alias.length > 120)) fieldErrors.aliases = "Each alias must be 120 characters or fewer";

  const status = input.status ?? "Active";
  if (!characterStatuses.includes(status as CharacterMetadataInput["status"])) {
    fieldErrors.status = "Status is invalid";
  }
  const role = input.role ?? "Support";
  if (!characterRoles.includes(role as CharacterRole)) fieldErrors.role = "Role is invalid";

  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Review the highlighted fields", fieldErrors };
  }

  return {
    ok: true,
    data: {
      ...text,
      aliases,
      role: role as CharacterRole,
      status: status as CharacterMetadataInput["status"]
    }
  };
}
