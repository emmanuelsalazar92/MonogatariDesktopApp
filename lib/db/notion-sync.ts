import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function getNotionSyncState(novelId: string) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: {},
    create: { novelId, isDirty: true }
  });
}

export async function markNotionSynced(novelId: string) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: { isDirty: false, lastNotionSync: new Date() },
    create: { novelId, isDirty: false, lastNotionSync: new Date() }
  });
}
