import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { applyNotionChapterUpdates, applyNotionSceneUpdates, NotionPullApplyError } from "@/lib/db/notion-pull";
import {
  getNotionContentBaselines,
  recordNotionPull,
  type NotionContentBaselines
} from "@/lib/db/notion-sync";
import { getNotionMappings, getNotionPublishSource } from "@/lib/db/notion-publish";
import { assertNotionPageWithinRoot, NotionApiError, requestNotion } from "@/lib/notion";
import {
  getAuthorizedNotionRootPageId,
  getNotionChapterSyncSnapshots,
  getNotionSceneSyncSnapshots,
  NotionPublishError
} from "@/lib/notion-publish";
import {
  NotionRemoteContentError,
  parseCompleteNotionChapterBlocks,
  parseCompleteNotionSceneBlocks,
  type NotionRemoteBlock,
  type RemoteSceneUpdate
} from "@/lib/notion-pull-safety";
import { assertSchemaCompatible } from "@/lib/schema-compatibility";
import { classifyNotionSceneEvidence } from "@/lib/notion-scene-sync-engine";

type NotionBlockList = {
  results?: unknown;
  has_more?: unknown;
  next_cursor?: unknown;
};

type PullTarget = {
  chapterId: string;
  title?: string;
  remote: string;
  scenes: RemoteSceneUpdate[];
  pageId: string;
  pageCount: number;
  blockCount: number;
};

export type NotionPullConflict = {
  chapterId: string;
  chapterTitle: string;
  sceneId?: string;
  sceneTitle?: string;
  code:
    | "BASELINE_REQUIRED"
    | "CONTENT_CONFLICT"
    | "REMOTE_CHANGES"
    | "DESTRUCTIVE_REMOTE_EMPTY"
    | "UNSUPPORTED_REMOTE_STRUCTURE"
    | "STRUCTURE_CONFLICT";
  message: string;
  localContent?: string;
  baselineContent?: string;
  remoteContent?: string;
};

export class NotionPullError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly conflicts: NotionPullConflict[] = [],
    public readonly results: NotionScenePullResult[] = []
  ) {
    super(message);
  }
}

export type NotionScenePullResult = { sceneId: string; notionPageId: string; stage: "FETCH_REMOTE" | "READ_BLOCKS" | "DETECT_CHANGE" | "APPLY_LOCAL"; outcome: "APPLIED" | "UNCHANGED" | "CONFLICT" | "SKIPPED" | "FAILED"; remoteChanged: boolean; localChanged: boolean; code?: string };

function blockText(block: NotionRemoteBlock) {
  const type = typeof block.type === "string" ? block.type : "unsupported";
  const content = block[type] as
    | { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }
    | undefined;
  return (content?.rich_text ?? [])
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("");
}

function contentFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function logPullDecision(input: {
  operationId: string;
  novelId: string;
  chapterId: string;
  sceneId?: string;
  pageId: string;
  pageCount?: number;
  blockCount?: number;
  localContent?: string;
  remoteContent?: string;
  decision: "apply" | "preserve" | "conflict" | "error";
  reason?: string;
}) {
  console.info("notion_pull_scene_decision", {
    operationId: input.operationId,
    novelId: input.novelId,
    chapterId: input.chapterId,
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    direction: "pull",
    remoteReadSuccess: input.decision !== "error",
    ...(input.pageCount !== undefined ? { pageCount: input.pageCount } : {}),
    ...(input.blockCount !== undefined ? { blockCount: input.blockCount } : {}),
    ...(input.localContent !== undefined ? { localContentLength: input.localContent.length, localContentFingerprint: contentFingerprint(input.localContent) } : {}),
    ...(input.remoteContent !== undefined ? { remoteContentLength: input.remoteContent.length, remoteContentFingerprint: contentFingerprint(input.remoteContent) } : {}),
    decision: input.decision,
    ...(input.reason ? { reason: input.reason } : {})
  });
}

function remoteSnapshot(blocks: NotionRemoteBlock[]) {
  return JSON.stringify(
    blocks.map((block) => ({
      type: typeof block.type === "string" ? block.type : "unsupported",
      text: blockText(block)
    }))
  );
}

function formatLocalContent(snapshot: string) {
  try {
    const value = JSON.parse(snapshot) as {
      title?: string;
      summary?: string;
      scenes?: Array<{ title?: string; content?: string; summary?: string }>;
    };
    return [
      value.title && `# ${value.title}`,
      value.summary,
      ...(value.scenes ?? []).flatMap((scene) => [
        scene.title && `## ${scene.title}`,
        scene.summary,
        scene.content
      ])
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n\n");
  } catch {
    return snapshot;
  }
}

function formatRemoteContent(snapshot: string) {
  try {
    return (JSON.parse(snapshot) as Array<{ type?: string; text?: string }>)
      .map((block) => {
        if (block.type === "heading_1") return `# ${block.text ?? ""}`;
        if (block.type === "heading_2") return `## ${block.text ?? ""}`;
        return block.text ?? "";
      })
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return snapshot;
  }
}

async function getPageBlocks(pageId: string, rootPageId: string) {
  await assertNotionPageWithinRoot(pageId, rootPageId);
  const blocks: NotionRemoteBlock[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  let pageCount = 0;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await requestNotion<NotionBlockList>(`/v1/blocks/${pageId}/children?${query}`);
    pageCount += 1;
    if (!Array.isArray(page.results) || typeof page.has_more !== "boolean") {
      throw new NotionRemoteContentError("REMOTE_READ_INCOMPLETE", "Notion returned an incomplete block page.");
    }
    const pageBlocks = page.results.filter((block): block is NotionRemoteBlock =>
      Boolean(block) && typeof block === "object" && !Array.isArray(block)
    );
    if (pageBlocks.length !== page.results.length) {
      throw new NotionRemoteContentError("REMOTE_READ_INCOMPLETE", "Notion returned an invalid block entry.");
    }
    blocks.push(...pageBlocks);
    if (!page.has_more) {
      cursor = null;
      continue;
    }
    if (typeof page.next_cursor !== "string" || !page.next_cursor || seenCursors.has(page.next_cursor)) {
      throw new NotionRemoteContentError("REMOTE_READ_INCOMPLETE", "Notion did not provide a complete block pagination cursor.");
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  } while (cursor);

  return { blocks, pageCount, blockCount: blocks.length };
}

export async function getNotionRemoteChanges(novelId: string) {
  const rootPageId = await getAuthorizedNotionRootPageId();
  const source = await getNotionPublishSource(novelId);
  if (!source) throw new NotionPullError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  const baselines = await getNotionContentBaselines(novelId);
  const mappings = (await getNotionMappings(novelId)).filter((mapping) => mapping.entityType === "chapter");

  for (const mapping of mappings) {
    const chapterId = mapping.localId.replace(/^chapter:/, "");
    const baseline = baselines[chapterId];
    if (!baseline) return { changed: true, chapterId };

    const localScenes = source.scenes
      .filter((scene) => scene.chapterId === chapterId)
      .map((scene) => ({ id: scene.id, summary: scene.summary }));
    const remoteRead = await getPageBlocks(mapping.notionPageId, rootPageId);
    parseCompleteNotionChapterBlocks(remoteRead.blocks, localScenes);
    const remote = remoteSnapshot(remoteRead.blocks);
    if (remote !== baseline.remote) return { changed: true, chapterId };
  }

  return { changed: false as const };
}

async function pullMappedScenePages(
  novelId: string,
  rootPageId: string,
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>,
  operationId: string,
  options: { sceneId?: string; resolution?: "accept-remote" | "keep-local" | "cancel"; beforeApply?: () => Promise<void>; inspectOnly?: boolean }
) {
  const baselines = await getNotionContentBaselines(novelId);
  const snapshots = new Map(getNotionSceneSyncSnapshots(source).map((snapshot) => [snapshot.sceneId, snapshot]));
  const mappings = (await getNotionMappings(novelId)).filter((mapping) => mapping.entityType === "scene" && (!options.sceneId || mapping.localId === `scene:${options.sceneId}`));
  if (options.sceneId && mappings.length === 0) throw new NotionPullError(404, "SCENE_MAPPING_REQUIRED", "This Scene has no Notion mapping to pull.");
  const results: NotionScenePullResult[] = [];
  const updates: Array<{ sceneId: string; notionPageId: string; content: string; expectedRevision: number; localBaseline: string; remote: string; allowEmptyOverwrite?: boolean }> = [];
  const conflicts: NotionPullConflict[] = [];

  for (const mapping of mappings) {
    const sceneId = mapping.localId.replace(/^scene:/, "");
    const scene = source.scenes.find((item) => item.id === sceneId);
    const snapshot = snapshots.get(sceneId);
    const baseline = baselines[sceneId];
    if (!scene || !snapshot) throw new NotionPullError(409, "PULL_APPLY_BLOCKED", "The Scene mapping no longer matches a local Scene.", [], results);
    let remoteRead: Awaited<ReturnType<typeof getPageBlocks>>;
    try {
      remoteRead = await getPageBlocks(mapping.notionPageId, rootPageId);
      const remote = remoteSnapshot(remoteRead.blocks);
      const parsed = parseCompleteNotionSceneBlocks(remoteRead.blocks, { id: scene.id, summary: scene.summary });
      if (!baseline) {
        if (options.resolution === "accept-remote") {
          const localBaseline = JSON.stringify({ id: scene.id, chapterId: scene.chapterId, title: scene.title, summary: scene.summary, content: parsed.content, revision: scene.revision + 1 });
          updates.push({ sceneId, notionPageId: mapping.notionPageId, content: parsed.content, expectedRevision: scene.revision, localBaseline, remote, allowEmptyOverwrite: parsed.content === "" && scene.content.trim() !== "" });
          results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "APPLY_LOCAL", outcome: "APPLIED", remoteChanged: true, localChanged: true, code: "BASELINE_ACCEPTED_REMOTE" });
        } else if (options.inspectOnly && options.resolution === "keep-local") {
          results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "DETECT_CHANGE", outcome: "SKIPPED", remoteChanged: true, localChanged: true, code: "KEEP_LOCAL_CONFIRMED" });
        } else {
          results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "DETECT_CHANGE", outcome: "CONFLICT", remoteChanged: true, localChanged: true, code: "BASELINE_REQUIRED" });
          conflicts.push({ chapterId: scene.chapterId, chapterTitle: source.chapters.find((chapter) => chapter.id === scene.chapterId)?.title ?? "Unknown chapter", sceneId, sceneTitle: scene.title, code: "BASELINE_REQUIRED", message: "No trustworthy last-synchronized baseline exists. Choose which complete version to keep.", localContent: scene.content, remoteContent: parsed.content });
        }
        continue;
      }
      const evidence = classifyNotionSceneEvidence({ local: snapshot.local, remote, baselineLocal: baseline.local, baselineRemote: baseline.remote, localContentNonEmpty: scene.content.trim().length > 0, remoteContentEmpty: parsed.content === "" });
      const remoteChanged = remote !== baseline.remote;
      const localChanged = snapshot.local !== baseline.local;
      if (!remoteChanged) {
        results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "DETECT_CHANGE", outcome: localChanged ? "SKIPPED" : "UNCHANGED", remoteChanged, localChanged });
        continue;
      }
      const destructiveEmpty = evidence === "DESTRUCTIVE_NOTION_EMPTY";
      if (options.inspectOnly && options.resolution === "keep-local") {
        results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "DETECT_CHANGE", outcome: "SKIPPED", remoteChanged, localChanged, code: "KEEP_LOCAL_CONFIRMED" });
        continue;
      }
      if ((options.inspectOnly || destructiveEmpty || localChanged) && options.resolution !== "accept-remote") {
        results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "DETECT_CHANGE", outcome: "CONFLICT", remoteChanged, localChanged, code: parsed.content === "" ? "DESTRUCTIVE_REMOTE_EMPTY" : "CONTENT_CONFLICT" });
        let baselineContent = "";
        try { baselineContent = (JSON.parse(baseline.local) as { content?: string }).content ?? ""; } catch { /* malformed baselines are shown as unavailable */ }
        const code = destructiveEmpty ? "DESTRUCTIVE_REMOTE_EMPTY" : localChanged ? "CONTENT_CONFLICT" : "REMOTE_CHANGES";
        conflicts.push({ chapterId: scene.chapterId, chapterTitle: source.chapters.find((chapter) => chapter.id === scene.chapterId)?.title ?? "Unknown chapter", sceneId, sceneTitle: scene.title, code, message: destructiveEmpty ? "Notion would replace non-empty local manuscript content with an empty document." : localChanged ? "Both the local Scene and its Notion page changed since the last sync." : "Notion changed since the last sync; review it before pushing the local version.", localContent: scene.content, baselineContent, remoteContent: parsed.content });
        continue;
      }
      const localBaseline = JSON.stringify({ id: scene.id, chapterId: scene.chapterId, title: scene.title, summary: scene.summary, content: parsed.content, revision: scene.revision + 1 });
      updates.push({ sceneId, notionPageId: mapping.notionPageId, content: parsed.content, expectedRevision: scene.revision, localBaseline, remote, allowEmptyOverwrite: destructiveEmpty && options.resolution === "accept-remote" });
      results.push({ sceneId, notionPageId: mapping.notionPageId, stage: "APPLY_LOCAL", outcome: "APPLIED", remoteChanged, localChanged });
    } catch (error) {
      logPullDecision({ operationId, novelId, chapterId: scene.chapterId, sceneId, pageId: mapping.notionPageId, decision: "error", reason: error instanceof Error ? error.message : "scene_pull_failed" });
      results.push({ sceneId, notionPageId: mapping.notionPageId, stage: error instanceof NotionRemoteContentError ? "READ_BLOCKS" : "FETCH_REMOTE", outcome: "FAILED", remoteChanged: false, localChanged: false, code: error instanceof NotionRemoteContentError ? error.code : "REMOTE_FETCH_FAILED" });
      if (error instanceof NotionRemoteContentError) throw new NotionPullError(422, error.code, error.message, [], results);
      throw error;
    }
  }
  if (conflicts.length) throw new NotionPullError(409, "PULL_CONFLICT", "Notion changes were not applied because a conflict needs review.", conflicts, results);
  if (updates.length) {
    await options.beforeApply?.();
    const nextBaselines = { ...baselines };
    for (const update of updates) nextBaselines[update.sceneId] = { local: update.localBaseline, remote: update.remote };
    try { await applyNotionSceneUpdates(novelId, updates, nextBaselines); }
    catch (error) {
      for (const result of results) if (result.outcome === "APPLIED") { result.outcome = "FAILED"; result.code = "PULL_APPLY_BLOCKED"; }
      if (error instanceof NotionPullApplyError) throw new NotionPullError(409, "PULL_APPLY_BLOCKED", "Notion content was not applied because local Scene state or its mapping changed.", [], results);
      throw error;
    }
  }
  return { operationId, direction: "PULL" as const, novelId, appliedScenes: updates.length, conflicts: 0, failures: 0, results, appliedChapters: 0, message: updates.length ? `Applied Notion changes to ${updates.length} Scene(s) in SQLite.` : "No newer Notion Scene changes were found." };
}

export async function pullNovelFromNotion(
  novelId: string,
  chapterId?: string,
  options: {
    resolution?: "accept-remote" | "keep-local" | "cancel";
    beforeApply?: () => Promise<void>;
    sceneId?: string;
    inspectOnly?: boolean;
  } = {}
) {
  assertSchemaCompatible();
  const operationId = randomUUID();
  const rootPageId = await getAuthorizedNotionRootPageId();
  const source = await getNotionPublishSource(novelId);
  if (!source) {
    throw new NotionPullError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  // Scene pages are the current synchronization boundary. Each mapped Scene is
  // read and compared independently; a Pull must never report success for a
  // legacy chapter no-op.
  if ((await getNotionMappings(novelId)).some((mapping) => mapping.entityType === "scene")) {
    return pullMappedScenePages(novelId, rootPageId, source, operationId, options);
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
  const acknowledgedTargets: PullTarget[] = [];
  let resolvedConflict = false;

  for (const mapping of selectedMappings) {
    const current = chapterSnapshots.get(mapping.localId.replace(/^chapter:/, ""));
    const baseline = current ? baselines[current.chapterId] : undefined;
    if (!current || !baseline) {
      conflicts.push({
        chapterId: current?.chapterId ?? mapping.localId,
        chapterTitle: source.chapters.find((chapter) => chapter.id === current?.chapterId)?.title ?? "Unknown chapter",
        code: "BASELINE_REQUIRED",
        message: "A safe pull needs one completed Notion sync as its comparison baseline."
      });
      continue;
    }

    let remoteRead: Awaited<ReturnType<typeof getPageBlocks>>;
    try {
      remoteRead = await getPageBlocks(mapping.notionPageId, rootPageId);
    } catch (error) {
      logPullDecision({
        operationId,
        novelId,
        chapterId: current.chapterId,
        pageId: mapping.notionPageId,
        decision: "error",
        reason: error instanceof Error ? error.message : "remote_read_failed"
      });
      if (error instanceof NotionRemoteContentError) {
        throw new NotionPullError(422, error.code, error.message);
      }
      throw error;
    }
    const remote = remoteSnapshot(remoteRead.blocks);
    const localScenes = source.scenes
      .filter((scene) => scene.chapterId === current?.chapterId)
      .map((scene) => ({ id: scene.id, summary: scene.summary, content: scene.content }));
    let parsedRemote: ReturnType<typeof parseCompleteNotionChapterBlocks>;
    try {
      parsedRemote = parseCompleteNotionChapterBlocks(remoteRead.blocks, localScenes);
    } catch (error) {
      logPullDecision({
        operationId,
        novelId,
        chapterId: current.chapterId,
        pageId: mapping.notionPageId,
        pageCount: remoteRead.pageCount,
        blockCount: remoteRead.blockCount,
        decision: "error",
        reason: error instanceof Error ? error.message : "remote_parse_failed"
      });
      if (error instanceof NotionRemoteContentError) {
        throw new NotionPullError(422, error.code, error.message);
      }
      throw error;
    }
    const scenes = parsedRemote.scenes;
    const title = parsedRemote.chapterTitle || undefined;
    const remoteChanged = remote !== baseline.remote;
    const localChanged = current.local !== baseline.local;
    const target = {
      chapterId: current.chapterId,
      title,
      remote,
      scenes,
      pageId: mapping.notionPageId,
      pageCount: remoteRead.pageCount,
      blockCount: remoteRead.blockCount
    };
    const destructiveEmptyScenes = scenes.filter((scene) =>
      scene.content === "" && localScenes.find((local) => local.id === scene.localSceneId)?.content.trim()
    );

    if (remoteChanged && destructiveEmptyScenes.length > 0) {
      if (options.resolution === "accept-remote") {
        targets.push({
          ...target,
          scenes: scenes.map((scene) => ({
            ...scene,
            allowEmptyOverwrite: destructiveEmptyScenes.some((empty) => empty.localSceneId === scene.localSceneId)
          }))
        });
        resolvedConflict = true;
        continue;
      }
      if (options.resolution === "keep-local" || options.resolution === "cancel") {
        acknowledgedTargets.push(target);
        resolvedConflict = true;
        continue;
      }
      for (const scene of destructiveEmptyScenes) {
        const local = localScenes.find((item) => item.id === scene.localSceneId)!;
        logPullDecision({
          operationId,
          novelId,
          chapterId: current.chapterId,
          sceneId: scene.localSceneId,
          pageId: mapping.notionPageId,
          pageCount: remoteRead.pageCount,
          blockCount: remoteRead.blockCount,
          localContent: local.content,
          remoteContent: scene.content,
          decision: "conflict",
          reason: "remote_empty_requires_explicit_resolution"
        });
      }
      conflicts.push({
        chapterId: current.chapterId,
        chapterTitle: source.chapters.find((chapter) => chapter.id === current.chapterId)?.title ?? "Unknown chapter",
        code: "DESTRUCTIVE_REMOTE_EMPTY",
        message: "Notion would replace non-empty local manuscript content with an empty document. Review and explicitly accept the remote version to continue."
      });
      continue;
    }

    if (remoteChanged && localChanged) {
      if (options.resolution === "accept-remote") {
        targets.push(target);
        resolvedConflict = true;
        continue;
      }
      if (options.resolution === "keep-local" || options.resolution === "cancel") {
        acknowledgedTargets.push(target);
        resolvedConflict = true;
        continue;
      }
      conflicts.push({
        chapterId: current.chapterId,
        chapterTitle: source.chapters.find((chapter) => chapter.id === current.chapterId)?.title ?? "Unknown chapter",
        code: "CONTENT_CONFLICT",
        message: "Both the local chapter and its Notion page changed since the last sync.",
        localContent: formatLocalContent(current.local),
        remoteContent: formatRemoteContent(remote)
      });
      continue;
    }
    if (remoteChanged) {
      targets.push(target);
    }
  }

  if (conflicts.length > 0) {
    throw new NotionPullError(409, "PULL_CONFLICT", "Notion changes were not applied because a conflict needs review.", conflicts);
  }

  if (options.resolution && !resolvedConflict) {
    throw new NotionPullError(
      409,
      "CONFLICT_NO_LONGER_CURRENT",
      "The Notion conflict changed before it could be resolved. Refresh and compare again."
    );
  }

  if (targets.length === 0 && acknowledgedTargets.length === 0) {
    return { appliedChapters: 0, message: "No newer Notion changes were found." };
  }

  if (targets.length > 0) await options.beforeApply?.();
  if (targets.length > 0) {
    try {
      await applyNotionChapterUpdates(
        novelId,
        targets.map((target) => ({
          chapterId: target.chapterId,
          title: target.title,
          scenes: target.scenes
        }))
      );
    } catch (error) {
      for (const target of targets) {
        for (const scene of target.scenes) {
          logPullDecision({
            operationId,
            novelId,
            chapterId: target.chapterId,
            sceneId: scene.localSceneId,
            pageId: target.pageId,
            pageCount: target.pageCount,
            blockCount: target.blockCount,
            remoteContent: scene.content,
            decision: "preserve",
            reason: error instanceof Error ? error.message : "apply_failed"
          });
        }
      }
      if (error instanceof NotionPullApplyError) {
        throw new NotionPullError(409, "PULL_APPLY_BLOCKED", "Notion content was not applied because its local mapping or safety proof changed.");
      }
      throw error;
    }
    for (const target of targets) {
      for (const scene of target.scenes) {
        logPullDecision({
          operationId,
          novelId,
          chapterId: target.chapterId,
          sceneId: scene.localSceneId,
          pageId: target.pageId,
          pageCount: target.pageCount,
          blockCount: target.blockCount,
          remoteContent: scene.content,
          decision: "apply"
        });
      }
    }
  }

  const nextSource = await getNotionPublishSource(novelId);
  if (!nextSource) throw new NotionPullError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  const nextSnapshots = new Map(
    getNotionChapterSyncSnapshots(nextSource).map((snapshot) => [snapshot.chapterId, snapshot])
  );
  const nextBaselines: NotionContentBaselines = { ...baselines };
  for (const target of [...targets, ...acknowledgedTargets]) {
    const next = nextSnapshots.get(target.chapterId);
    if (next) nextBaselines[target.chapterId] = { local: next.local, remote: target.remote };
  }
  await recordNotionPull(novelId, nextBaselines);

  return {
    appliedChapters: targets.length,
    message:
      targets.length > 0
        ? `Applied Notion changes to ${targets.length} chapter(s) in SQLite.`
        : "The conflict was acknowledged without replacing local content."
  };
}

export { NotionApiError, NotionPublishError };
