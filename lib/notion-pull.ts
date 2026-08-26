import "server-only";

import { applyNotionChapterUpdates, type RemoteSceneUpdate } from "@/lib/db/notion-pull";
import {
  getNotionContentBaselines,
  recordNotionPull,
  type NotionContentBaselines
} from "@/lib/db/notion-sync";
import { getNotionMappings, getNotionPublishSource } from "@/lib/db/notion-publish";
import { NotionApiError, requestNotion } from "@/lib/notion";
import { getNotionChapterSyncSnapshots, NotionPublishError } from "@/lib/notion-publish";

type NotionRemoteBlock = {
  type?: string;
  [key: string]: unknown;
};

type NotionBlockList = {
  results: NotionRemoteBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

type PullTarget = {
  chapterId: string;
  title?: string;
  remote: string;
  scenes: RemoteSceneUpdate[];
};

export type NotionPullConflict = {
  chapterId: string;
  code:
    | "BASELINE_REQUIRED"
    | "CONTENT_CONFLICT"
    | "UNSUPPORTED_REMOTE_STRUCTURE"
    | "STRUCTURE_CONFLICT";
  message: string;
};

export class NotionPullError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly conflicts: NotionPullConflict[] = []
  ) {
    super(message);
  }
}

function blockText(block: NotionRemoteBlock) {
  const type = typeof block.type === "string" ? block.type : "unsupported";
  const content = block[type] as
    | { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }
    | undefined;
  return (content?.rich_text ?? [])
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("");
}

function remoteSnapshot(blocks: NotionRemoteBlock[]) {
  return JSON.stringify(
    blocks.map((block) => ({
      type: typeof block.type === "string" ? block.type : "unsupported",
      text: blockText(block)
    }))
  );
}

function scenesFromRemoteBlocks(
  blocks: NotionRemoteBlock[],
  localScenes: Array<{ summary: string }>
) {
  const scenes: Array<RemoteSceneUpdate & { paragraphs: string[] }> = [];
  let current: (RemoteSceneUpdate & { paragraphs: string[] }) | null = null;

  for (const block of blocks) {
    if (block.type === "heading_2") {
      current = { title: blockText(block), content: "", paragraphs: [] };
      scenes.push(current);
      continue;
    }
    if (block.type === "paragraph" && current) {
      current.paragraphs.push(blockText(block));
    }
  }

  return scenes.map((scene, index) => {
    const paragraphs =
      scene.paragraphs[0] === localScenes[index]?.summary
        ? scene.paragraphs.slice(1)
        : scene.paragraphs;
    return { title: scene.title, content: paragraphs.join("\n\n") };
  });
}

function chapterTitleFromRemoteBlocks(blocks: NotionRemoteBlock[]) {
  const remoteTitle = blocks.find((block) => block.type === "heading_1");
  if (!remoteTitle) return undefined;
  return blockText(remoteTitle).replace(/^\d{2}\.\d{2}\s+—\s+/, "").trim() || undefined;
}

async function getPageBlocks(pageId: string) {
  const blocks: NotionRemoteBlock[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await requestNotion<NotionBlockList>(`/v1/blocks/${pageId}/children?${query}`);
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return blocks;
}

export async function pullNovelFromNotion(novelId: string, chapterId?: string) {
  const source = await getNotionPublishSource(novelId);
  if (!source) {
    throw new NotionPullError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  const chapterSnapshots = new Map(
    getNotionChapterSyncSnapshots(source).map((snapshot) => [snapshot.chapterId, snapshot])
  );
  const baselines = await getNotionContentBaselines(novelId);
  const mappings = (await getNotionMappings(novelId)).filter((mapping) => mapping.entityType === "chapter");
  const selectedMappings = chapterId
    ? mappings.filter((mapping) => mapping.localId === `chapter:${chapterId}`)
    : mappings;

  if (selectedMappings.length === 0) {
    throw new NotionPullError(
      400,
      "CHAPTER_MAPPING_REQUIRED",
      "Publish a synchronized chapter to Notion before requesting updates."
    );
  }

  const conflicts: NotionPullConflict[] = [];
  const targets: PullTarget[] = [];

  for (const mapping of selectedMappings) {
    const current = chapterSnapshots.get(mapping.localId.replace(/^chapter:/, ""));
    const baseline = current ? baselines[current.chapterId] : undefined;
    if (!current || !baseline) {
      conflicts.push({
        chapterId: current?.chapterId ?? mapping.localId,
        code: "BASELINE_REQUIRED",
        message: "A safe pull needs one completed Notion sync as its comparison baseline."
      });
      continue;
    }

    const remoteBlocks = await getPageBlocks(mapping.notionPageId);
    const remote = remoteSnapshot(remoteBlocks);
    const localScenes = source.scenes
      .filter((scene) => scene.chapterId === current?.chapterId)
      .map((scene) => ({ summary: scene.summary }));
    const scenes = scenesFromRemoteBlocks(remoteBlocks, localScenes);
    const title = chapterTitleFromRemoteBlocks(remoteBlocks);
    const remoteChanged = remote !== baseline.remote;
    const localChanged = current.local !== baseline.local;

    if (remoteChanged && localChanged) {
      conflicts.push({
        chapterId: current.chapterId,
        code: "CONTENT_CONFLICT",
        message: "Both the local chapter and its Notion page changed since the last sync."
      });
      continue;
    }
    if (remoteChanged && scenes.length === 0) {
      conflicts.push({
        chapterId: current.chapterId,
        code: "UNSUPPORTED_REMOTE_STRUCTURE",
        message: "The Notion page no longer has scene headings that Monogatari can safely apply."
      });
      continue;
    }
    if (
      remoteChanged &&
      scenes.length !== source.scenes.filter((scene) => scene.chapterId === current.chapterId).length
    ) {
      conflicts.push({
        chapterId: current.chapterId,
        code: "STRUCTURE_CONFLICT",
        message: "The Notion page changed its scene structure and needs manual review."
      });
      continue;
    }
    if (remoteChanged) {
      targets.push({ chapterId: current.chapterId, title, remote, scenes });
    }
  }

  if (conflicts.length > 0) {
    throw new NotionPullError(409, "PULL_CONFLICT", "Notion changes were not applied because a conflict needs review.", conflicts);
  }

  if (targets.length === 0) {
    return { appliedChapters: 0, message: "No newer Notion changes were found." };
  }

  await applyNotionChapterUpdates(
    novelId,
    targets.map((target) => ({
      chapterId: target.chapterId,
      title: target.title,
      scenes: target.scenes
    }))
  );

  const nextSource = await getNotionPublishSource(novelId);
  if (!nextSource) throw new NotionPullError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  const nextSnapshots = new Map(
    getNotionChapterSyncSnapshots(nextSource).map((snapshot) => [snapshot.chapterId, snapshot])
  );
  const nextBaselines: NotionContentBaselines = { ...baselines };
  for (const target of targets) {
    const next = nextSnapshots.get(target.chapterId);
    if (next) nextBaselines[target.chapterId] = { local: next.local, remote: target.remote };
  }
  await recordNotionPull(novelId, nextBaselines);

  return {
    appliedChapters: targets.length,
    message: `Applied Notion changes to ${targets.length} chapter(s) in SQLite.`
  };
}

export { NotionApiError, NotionPublishError };
