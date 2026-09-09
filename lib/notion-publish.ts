import "server-only";

import {
  getNotionMappings,
  getNotionPublishSource,
  getNotionRootPageId,
  upsertNotionMapping
} from "@/lib/db/notion-publish";
import {
  assertNotionPageWithinRoot,
  normalizeNotionPageId,
  NotionApiError,
  requestNotion
} from "@/lib/notion";
import { buildNotionPageUpdatePayload } from "@/lib/notion-page-update-payload";

type NotionPage = { id: string; url: string };
type NotionBlock = Record<string, unknown>;

export type NotionSceneSyncSnapshot = {
  sceneId: string;
  local: string;
  remote: string;
};

const MAX_TEXT_LENGTH = 1_900;
const MAX_BLOCKS_PER_REQUEST = 100;

export class NotionPublishError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly stage: "FETCH_REMOTE" | "CREATE_PAGE" | "UPDATE_PAGE" | "APPEND_BLOCKS" | "UPDATE_BASELINE" | "UNKNOWN" = "UNKNOWN",
    public readonly cause: NotionApiError | null = null
  ) {
    super(message);
  }
}

export async function getAuthorizedNotionRootPageId() {
  const rootSetting = await getNotionRootPageId();
  const rootPageId = rootSetting ? normalizeNotionPageId(rootSetting) : null;
  if (!rootPageId) {
    throw new NotionPublishError(
      400,
      "ROOT_PAGE_REQUIRED",
      "Configure and validate a Notion root page before publishing a novel."
    );
  }

  await assertNotionPageWithinRoot(rootPageId, rootPageId);
  return rootPageId;
}

function chunks(value: string) {
  if (!value) return [""];
  return Array.from({ length: Math.ceil(value.length / MAX_TEXT_LENGTH) }, (_, index) =>
    value.slice(index * MAX_TEXT_LENGTH, (index + 1) * MAX_TEXT_LENGTH)
  );
}

function richText(value: string) {
  return chunks(value).map((content) => ({ type: "text", text: { content } }));
}

function heading(level: 1 | 2, value: string): NotionBlock {
  const type = level === 1 ? "heading_1" : "heading_2";
  return { object: "block", type, [type]: { rich_text: richText(value) } };
}

function paragraph(value: string): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText(value) } };
}

function paragraphBlocks(value: string) {
  const sections = value.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return sections.flatMap((section) => chunks(section).map((part) => paragraph(part)));
}

function charactersBlocks(source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>) {
  if (source.characters.length === 0) return [paragraph("No characters have been added to this novel yet.")];

  return source.characters.flatMap((character) => {
    const details = [
      character.role && `Role: ${character.role}`,
      character.alias && `Alias: ${character.alias}`,
      character.personality && `Personality: ${character.personality}`,
      character.goal && `Goal: ${character.goal}`,
      character.notes && `Notes: ${character.notes}`
    ].filter(Boolean) as string[];

    return [heading(2, character.name), ...details.flatMap(paragraphBlocks)];
  });
}

function planningBlocks(source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>) {
  const metadata = [
    source.novel.genre && `Genre: ${source.novel.genre}`,
    `Status: ${source.novel.status}`,
    `Word count: ${source.novel.wordCount}`
  ].filter(Boolean) as string[];

  const volumes = source.volumes.flatMap((volume, index) => {
    const relatedChapters = source.chapters.filter((chapter) => chapter.volumeId === volume.id);
    return [
      heading(2, `${String(index + 1).padStart(2, "0")} — ${volume.title}`),
      ...paragraphBlocks(volume.summary),
      ...relatedChapters.map((chapter, chapterIndex) =>
        paragraph(`${String(index + 1).padStart(2, "0")}.${String(chapterIndex + 1).padStart(2, "0")} ${chapter.title}`)
      )
    ];
  });

  return [...metadata.flatMap(paragraphBlocks), ...paragraphBlocks(source.novel.synopsis), ...volumes];
}

function sceneBlocks(scene: { summary: string; content: string }) {
  return [
    ...(scene.summary ? [heading(2, "Summary"), ...paragraphBlocks(scene.summary)] : []),
    heading(2, "Manuscript"),
    ...paragraphBlocks(scene.content)
  ];
}

async function publishStage<T>(stage: NotionPublishError["stage"], work: () => Promise<T>) {
  try { return await work(); }
  catch (error) {
    if (error instanceof NotionPublishError) throw error;
    if (error instanceof NotionApiError) throw new NotionPublishError(error.status, error.code, error.message, stage, error);
    throw error;
  }
}

function blockText(block: NotionBlock) {
  const type = typeof block.type === "string" ? block.type : "unsupported";
  const content = block[type] as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> } | undefined;
  return (content?.rich_text ?? [])
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("");
}

function remoteSnapshot(blocks: NotionBlock[]) {
  return JSON.stringify(
    blocks.map((block) => ({
      type: typeof block.type === "string" ? block.type : "unsupported",
      text: blockText(block)
    }))
  );
}

function localSnapshot(scene: { id: string; chapterId: string; title: string; summary: string; content: string; revision: number }) {
  return JSON.stringify({
    id: scene.id,
    chapterId: scene.chapterId,
    title: scene.title,
    summary: scene.summary,
    content: scene.content,
    revision: scene.revision
  });
}

export function getNotionSceneSyncSnapshots(
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  return source.scenes.map((scene) => ({
    sceneId: scene.id,
    local: localSnapshot(scene),
    remote: remoteSnapshot(sceneBlocks(scene))
  } satisfies NotionSceneSyncSnapshot));
}

/**
 * Legacy pull compatibility only. New publishing and conflict cursors are
 * scene-level; older connected novels are migrated to scene pages on their
 * next successful push.
 */
export function getNotionChapterSyncSnapshots(
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  return source.chapters.map((chapter) => {
    const local = JSON.stringify({
      title: chapter.title,
      summary: chapter.summary,
      scenes: source.scenes
        .filter((scene) => scene.chapterId === chapter.id)
        .map((scene) => ({ id: scene.id, title: scene.title, summary: scene.summary, content: scene.content }))
    });
    return { chapterId: chapter.id, local, remote: local };
  });
}

async function createPage(parentPageId: string, title: string) {
  return publishStage("CREATE_PAGE", () => requestNotion<NotionPage>("/v1/pages", {
    method: "POST",
    body: {
      parent: { page_id: parentPageId },
      properties: { title: { title: richText(title) } }
    }
  }));
}

async function updatePage(pageId: string, title: string, eraseContent: boolean) {
  return publishStage("UPDATE_PAGE", () => requestNotion<NotionPage>(`/v1/pages/${pageId}`, {
    method: "PATCH",
    body: buildNotionPageUpdatePayload(
      { title: { title: richText(title) } },
      eraseContent ? { eraseContent: true } : {}
    )
  }));
}

async function appendBlocks(pageId: string, blocks: NotionBlock[]) {
  for (let index = 0; index < blocks.length; index += MAX_BLOCKS_PER_REQUEST) {
    await publishStage("APPEND_BLOCKS", () => requestNotion(`/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      body: { children: blocks.slice(index, index + MAX_BLOCKS_PER_REQUEST) }
    }));
  }
}

export async function publishNovelToNotion(
  novelId: string,
  sourceOverride?: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  const parentRootPageId = await publishStage("FETCH_REMOTE", () => getAuthorizedNotionRootPageId());

  const source = sourceOverride ?? (await getNotionPublishSource(novelId));
  if (!source) {
    throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  const mappingRows = await getNotionMappings(novelId);
  const mappings = new Map<string, { localId: string; notionPageId: string }>(
    mappingRows.map((mapping) => [
      mapping.localId,
      { localId: mapping.localId, notionPageId: mapping.notionPageId }
    ])
  );
  const mappingRecords = new Map(mappingRows.map((mapping) => [mapping.localId, mapping]));
  let createdPages = 0;
  let updatedPages = 0;
  const sceneSnapshots = getNotionSceneSyncSnapshots(source);

  const publishPage = async (input: {
    localId: string;
    entityType: string;
    parentPageId: string;
    title: string;
    blocks?: NotionBlock[];
    replaceContent?: boolean;
  }) => {
    const mapped = mappings.get(input.localId);
    let page: NotionPage;
    let created = false;

    if (mapped) {
      try {
        await publishStage("FETCH_REMOTE", () => assertNotionPageWithinRoot(mapped.notionPageId, parentRootPageId));
        page = await updatePage(mapped.notionPageId, input.title, input.replaceContent ?? Boolean(input.blocks));
        updatedPages += 1;
      } catch (error) {
        if (!(error instanceof NotionApiError) || error.status !== 404) throw error;
        page = await createPage(input.parentPageId, input.title);
        created = true;
        createdPages += 1;
      }
    } else {
      page = await createPage(input.parentPageId, input.title);
      created = true;
      createdPages += 1;
    }

    await upsertNotionMapping({
      localId: input.localId,
      entityType: input.entityType,
      novelId,
      notionPageId: page.id
    });
    mappings.set(input.localId, { localId: input.localId, notionPageId: page.id });
    if (input.blocks) await appendBlocks(page.id, input.blocks);
    return { ...page, created };
  };

  try {
    const novelPage = await publishPage({
      localId: `novel:${source.novel.id}`,
      entityType: "novel",
      parentPageId: parentRootPageId,
      title: source.novel.title
    });
    const charactersPage = await publishPage({
      localId: `novel:${source.novel.id}:characters`,
      entityType: "characters",
      parentPageId: novelPage.id,
      title: "Characters",
      blocks: charactersBlocks(source)
    });
    const planningPage = await publishPage({
      localId: `novel:${source.novel.id}:planning`,
      entityType: "planning",
      parentPageId: novelPage.id,
      title: "Planning",
      blocks: planningBlocks(source)
    });
    const chaptersPage = await publishPage({
      localId: `novel:${source.novel.id}:chapters`,
      entityType: "chapters",
      parentPageId: novelPage.id,
      title: "Chapters"
    });

    for (const [volumeIndex, volume] of source.volumes.entries()) {
      const chapters = source.chapters.filter((chapter) => chapter.volumeId === volume.id);
      for (const [chapterIndex, chapter] of chapters.entries()) {
        const numberedTitle = `${String(volumeIndex + 1).padStart(2, "0")}.${String(chapterIndex + 1).padStart(2, "0")} — ${chapter.title}`;
        const legacyChapter = mappings.get(`chapter:${chapter.id}`);
        const chapterPage = await publishPage({
          localId: `chapter:${chapter.id}`,
          entityType: "chapter",
          parentPageId: chaptersPage.id,
          title: numberedTitle,
          // Existing chapter pages used to contain every scene. Clear that
          // legacy aggregate exactly once, then use the page as a container.
          replaceContent: Boolean(legacyChapter) && source.scenes.some((scene) => scene.chapterId === chapter.id && !mappings.has(`scene:${scene.id}`))
        });
        const scenes = source.scenes.filter((scene) => scene.chapterId === chapter.id);
        for (const [sceneIndex, scene] of scenes.entries()) {
          const localId = `scene:${scene.id}`;
          const mapped = mappings.get(localId);
          const snapshot = sceneSnapshots.find((item) => item.sceneId === scene.id)!;
          const mappingRecord = mappingRecords.get(localId);
          const changed = !mappingRecord ||
            scene.revision > mappingRecord.lastSyncedRevision ||
            mappingRecord.lastSyncedContent !== snapshot.local;
          const sceneTitle = `${String(volumeIndex + 1).padStart(2, "0")}.${String(chapterIndex + 1).padStart(2, "0")}.${String(sceneIndex + 1).padStart(2, "0")} — ${scene.title}`;
          if (!changed) continue;
          const page = await publishPage({
            localId,
            entityType: "scene",
            parentPageId: chapterPage.id,
            title: sceneTitle,
            blocks: sceneBlocks(scene),
            replaceContent: Boolean(mapped)
          });
          await upsertNotionMapping({
            localId,
            entityType: "scene",
            novelId,
            notionPageId: page.id,
            lastSyncedRevision: scene.revision,
            lastSyncedContent: snapshot.local,
            lastSyncedAt: new Date(),
            remoteArchivedAt: null
          });
          mappingRecords.set(localId, {
            ...mappingRecord,
            localId,
            entityType: "scene",
            novelId,
            notionPageId: page.id,
            lastSyncedRevision: scene.revision,
            lastSyncedContent: snapshot.local,
            lastSyncedAt: new Date(),
            remoteLastEditedAt: null,
            remoteArchivedAt: null,
            createdAt: mappingRecord?.createdAt ?? new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    // Archiving/deleting locally never destroys a user's remote document. The
    // mapped page is archived once, preserving its Notion history and making a
    // retry safe. Restoring locally reuses the same mapping and page id.
    const activeSceneIds = new Set(source.scenes.map((scene) => `scene:${scene.id}`));
    for (const mapping of mappingRows) {
      if (mapping.entityType !== "scene" || activeSceneIds.has(mapping.localId) || mapping.remoteArchivedAt) continue;
      await publishStage("FETCH_REMOTE", () => assertNotionPageWithinRoot(mapping.notionPageId, parentRootPageId));
      await publishStage("UPDATE_PAGE", () => requestNotion(`/v1/pages/${mapping.notionPageId}`, {
        method: "PATCH",
        body: buildNotionPageUpdatePayload({}, { archived: true })
      }));
      await upsertNotionMapping({
        localId: mapping.localId,
        entityType: mapping.entityType,
        novelId,
        notionPageId: mapping.notionPageId,
        remoteArchivedAt: new Date()
      });
      updatedPages += 1;
    }

    return {
      novelPage,
      createdPages,
      updatedPages,
      sceneSnapshots,
      sections: { charactersPage, planningPage, chaptersPage }
    };
  } catch (error) {
    if (error instanceof NotionPublishError || error instanceof NotionApiError) throw error;
    throw new NotionPublishError(500, "PUBLISH_FAILED", "Monogatari could not publish this novel to Notion.");
  }
}
