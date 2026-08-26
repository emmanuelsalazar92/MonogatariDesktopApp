import "server-only";

import { prisma } from "@/lib/db/prisma";

export type NotionChapterBaseline = {
  local: string;
  remote: string;
};

export type NotionContentBaselines = Record<string, NotionChapterBaseline>;

function parseBaselines(value: string): NotionContentBaselines {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, item]) =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as NotionChapterBaseline).local === "string" &&
          typeof (item as NotionChapterBaseline).remote === "string"
      )
    ) as NotionContentBaselines;
  } catch {
    return {};
  }
}

export async function getNotionSyncState(novelId: string) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: {},
    create: { novelId, isDirty: true }
  });
}

export async function getNotionContentBaselines(novelId: string) {
  const state = await getNotionSyncState(novelId);
  return parseBaselines(state.lastKnownContent);
}

export async function markNotionSynced(
  novelId: string,
  baselines?: NotionContentBaselines
) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: {
      isDirty: false,
      lastNotionSync: new Date(),
      ...(baselines ? { lastKnownContent: JSON.stringify(baselines) } : {})
    },
    create: {
      novelId,
      isDirty: false,
      lastNotionSync: new Date(),
      lastKnownContent: JSON.stringify(baselines ?? {})
    }
  });
}

export async function recordNotionPull(novelId: string, baselines: NotionContentBaselines) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: { lastKnownContent: JSON.stringify(baselines), lastNotionSync: new Date() },
    create: {
      novelId,
      isDirty: true,
      lastKnownContent: JSON.stringify(baselines),
      lastNotionSync: new Date()
    }
  });
}
