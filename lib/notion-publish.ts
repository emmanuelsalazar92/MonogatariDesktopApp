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

type NotionPage = { id: string; url: string };
type NotionBlock = Record<string, unknown>;

export type NotionChapterSyncSnapshot = {
  chapterId: string;
  local: string;
  remote: string;
};

const MAX_TEXT_LENGTH = 1_900;
const MAX_BLOCKS_PER_REQUEST = 100;

export class NotionPublishError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
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

function divider(): NotionBlock {
  return { object: "block", type: "divider", divider: {} };
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

function chapterBlocks(
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>,
  chapterId: string,
  title: string
) {
  const chapter = source.chapters.find((item) => item.id === chapterId);
  if (!chapter) return [];

  const scenes = source.scenes.filter((scene) => scene.chapterId === chapter.id);
  const blocks: NotionBlock[] = [heading(1, title), ...paragraphBlocks(chapter.summary)];

  scenes.forEach((scene, index) => {
    blocks.push(heading(2, `${String(index + 1).padStart(2, "0")} — ${scene.title}`));
    if (scene.summary) blocks.push(...paragraphBlocks(scene.summary));
    blocks.push(...paragraphBlocks(scene.content || "(Empty scene)"));
    if (index < scenes.length - 1) blocks.push(divider());
  });

  if (scenes.length === 0) blocks.push(paragraph("No scenes have been added to this chapter yet."));
  return blocks;
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

function localSnapshot(
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>,
  chapterId: string
) {
  const chapter = source.chapters.find((item) => item.id === chapterId);
  return JSON.stringify({
    title: chapter?.title ?? "",
    summary: chapter?.summary ?? "",
    scenes: source.scenes
      .filter((scene) => scene.chapterId === chapterId)
      .map((scene) => ({ title: scene.title, content: scene.content, summary: scene.summary }))
  });
}

export function getNotionChapterSyncSnapshots(
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  return source.chapters.map((chapter) => {
    const volumeIndex = source.volumes.findIndex((volume) => volume.id === chapter.volumeId);
    const chapterIndex = source.chapters
      .filter((item) => item.volumeId === chapter.volumeId)
      .findIndex((item) => item.id === chapter.id);
    const title = `${String(volumeIndex + 1).padStart(2, "0")}.${String(chapterIndex + 1).padStart(2, "0")} — ${chapter.title}`;
    return {
      chapterId: chapter.id,
      local: localSnapshot(source, chapter.id),
      remote: remoteSnapshot(chapterBlocks(source, chapter.id, title))
    } satisfies NotionChapterSyncSnapshot;
  });
}

async function createPage(parentPageId: string, title: string) {
  return requestNotion<NotionPage>("/v1/pages", {
    method: "POST",
    body: {
      parent: { page_id: parentPageId },
      properties: { title: { title: richText(title) } }
    }
  });
}

async function updatePage(pageId: string, title: string, eraseContent: boolean) {
  return requestNotion<NotionPage>(`/v1/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: { title: { title: richText(title) } },
      ...(eraseContent ? { erase_content: true } : {})
    }
  });
}

async function appendBlocks(pageId: string, blocks: NotionBlock[]) {
  for (let index = 0; index < blocks.length; index += MAX_BLOCKS_PER_REQUEST) {
    await requestNotion(`/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      body: { children: blocks.slice(index, index + MAX_BLOCKS_PER_REQUEST) }
    });
  }
}

export async function publishNovelToNotion(
  novelId: string,
  sourceOverride?: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  const parentRootPageId = await getAuthorizedNotionRootPageId();

  const source = sourceOverride ?? (await getNotionPublishSource(novelId));
  if (!source) {
    throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  const mappings = new Map<string, { localId: string; notionPageId: string }>(
    (await getNotionMappings(novelId)).map((mapping) => [
      mapping.localId,
      { localId: mapping.localId, notionPageId: mapping.notionPageId }
    ])
  );
  let createdPages = 0;
  let updatedPages = 0;
  const chapterSnapshots = getNotionChapterSyncSnapshots(source);

  const publishPage = async (input: {
    localId: string;
    entityType: string;
    parentPageId: string;
    title: string;
    blocks?: NotionBlock[];
  }) => {
    const mapped = mappings.get(input.localId);
    let page: NotionPage;
    let created = false;

    if (mapped) {
      try {
        await assertNotionPageWithinRoot(mapped.notionPageId, parentRootPageId);
        page = await updatePage(mapped.notionPageId, input.title, Boolean(input.blocks));
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
        await publishPage({
          localId: `chapter:${chapter.id}`,
          entityType: "chapter",
          parentPageId: chaptersPage.id,
          title: numberedTitle,
          blocks: chapterBlocks(source, chapter.id, numberedTitle)
        });
      }
    }

    return {
      novelPage,
      createdPages,
      updatedPages,
      chapterSnapshots,
      sections: { charactersPage, planningPage, chaptersPage }
    };
  } catch (error) {
    if (error instanceof NotionPublishError || error instanceof NotionApiError) throw error;
    throw new NotionPublishError(500, "PUBLISH_FAILED", "Monogatari could not publish this novel to Notion.");
  }
}
