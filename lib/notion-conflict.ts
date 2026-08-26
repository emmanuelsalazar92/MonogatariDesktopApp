import "server-only";

import { NotionPullError, pullNovelFromNotion } from "@/lib/notion-pull";
import { syncNovelToNotion } from "@/lib/notion-sync";
import { createSQLiteSnapshot } from "@/lib/sqlite-backup";

export type NotionConflictResolution = "keep-local" | "accept-remote" | "cancel";

export async function resolveNotionConflict(input: {
  novelId: string;
  chapterId: string;
  resolution: NotionConflictResolution;
}) {
  if (input.resolution === "accept-remote") {
    const result = await pullNovelFromNotion(input.novelId, input.chapterId, {
      resolution: "accept-remote",
      beforeApply: async () => {
        await createSQLiteSnapshot("Conflict recovery")
      }
    });
    return { ...result, message: "Notion version applied after creating a recovery snapshot." };
  }

  await pullNovelFromNotion(input.novelId, input.chapterId, {
    resolution: input.resolution
  });

  if (input.resolution === "keep-local") {
    const result = await syncNovelToNotion(input.novelId, true, { protectRemoteChanges: false });
    return {
      appliedChapters: 0,
      message: `Local version kept and synchronized to Notion (${result.createdPages ?? 0} created, ${result.updatedPages ?? 0} updated).`
    };
  }

  return {
    appliedChapters: 0,
    message: "Conflict cancelled. Local content was not replaced."
  };
}

export { NotionPullError };
