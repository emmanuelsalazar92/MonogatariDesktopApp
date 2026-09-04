export type TimelineAction = "archive" | "restore" | "delete";
export type TimelineImpact = { revision: number; archived: boolean; characters: number; places: number; notes: number; structure: number; hasDescription: boolean; token: string };
export function readTimelineLifecycle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["novelId", "action", "confirmed", "revision", "token"].includes(key)) || body.confirmed !== true
    || !["archive", "restore", "delete"].includes(body.action as string) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 0
    || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return null;
  return { action: body.action as TimelineAction, revision: body.revision as number, token: body.token };
}
