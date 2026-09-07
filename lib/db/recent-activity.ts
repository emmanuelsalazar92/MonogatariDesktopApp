import { randomUUID } from "node:crypto";

import type { Prisma } from "@/lib/generated/prisma/client";

export const recentActivityLimit = 10;
const retentionLimit = 80;
const sceneEditCoalesceMs = 15 * 60 * 1_000;

export type RecentActivityInput = {
  novelId: string;
  eventType: "scene-edited" | "structure-created" | "structure-moved" | "character-added" | "character-updated" | "place-added" | "place-updated";
  entityType: "volume" | "chapter" | "scene" | "character" | "place";
  entityId: string | null;
  label: string;
};

function safeLabel(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 180) || "Updated item";
}

// Activity is intentionally metadata-only. Callers pass a title/name snapshot,
// never manuscript, note body, request data, secrets, or sync payloads.
export async function recordRecentActivity(tx: Prisma.TransactionClient, input: RecentActivityInput) {
  const now = new Date();
  const label = safeLabel(input.label);
  if (input.eventType === "scene-edited" && input.entityId) {
    const previous = await tx.recentActivity.findFirst({
      where: {
        novelId: input.novelId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        createdAt: { gte: new Date(now.getTime() - sceneEditCoalesceMs) }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (previous) {
      await tx.recentActivity.update({ where: { id: previous.id }, data: { label, createdAt: now } });
      return;
    }
  }

  await tx.recentActivity.create({
    data: { id: `activity-${randomUUID()}`, ...input, label, createdAt: now }
  });
  const stale = await tx.recentActivity.findMany({
    where: { novelId: input.novelId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: retentionLimit,
    select: { id: true }
  });
  if (stale.length) await tx.recentActivity.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
}
