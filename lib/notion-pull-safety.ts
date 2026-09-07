export type NotionRemoteBlock = {
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
};

export type RemoteSceneUpdate = {
  localSceneId: string;
  title: string;
  content: string;
  contentState: "complete";
  allowEmptyOverwrite: boolean;
};

export class NotionRemoteContentError extends Error {
  constructor(
    public readonly code: "REMOTE_READ_INCOMPLETE" | "UNSUPPORTED_REMOTE_CONTENT" | "REMOTE_STRUCTURE_INVALID",
    message: string
  ) {
    super(message);
  }
}

type ParsedBlock = { type: "heading_1" | "heading_2" | "paragraph" | "divider"; text: string };
type LocalScene = { id: string; summary: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readRichText(block: NotionRemoteBlock, type: "heading_1" | "heading_2" | "paragraph") {
  const payload = record(block[type]);
  const richText = payload?.rich_text;
  if (!Array.isArray(richText)) {
    throw new NotionRemoteContentError("REMOTE_READ_INCOMPLETE", `Notion ${type} block is missing rich text.`);
  }

  return richText.map((item) => {
    const rich = record(item);
    if (!rich || typeof rich.plain_text !== "string") {
      throw new NotionRemoteContentError("REMOTE_READ_INCOMPLETE", "Notion returned an incomplete rich-text item.");
    }
    return rich.plain_text;
  }).join("");
}

export function parseCompleteNotionChapterBlocks(blocks: NotionRemoteBlock[], localScenes: LocalScene[]) {
  const parsed: ParsedBlock[] = blocks.map((block) => {
    const type = block.type;
    if (block.has_children === true) {
      throw new NotionRemoteContentError("UNSUPPORTED_REMOTE_CONTENT", "Nested Notion blocks cannot be safely imported.");
    }
    if (type === "divider") return { type, text: "" };
    if (type !== "heading_1" && type !== "heading_2" && type !== "paragraph") {
      throw new NotionRemoteContentError("UNSUPPORTED_REMOTE_CONTENT", "The Notion page contains a block type Monogatari cannot safely import.");
    }
    return { type, text: readRichText(block, type) };
  });

  const chapterHeadings = parsed.filter((block) => block.type === "heading_1");
  if (chapterHeadings.length !== 1 || !chapterHeadings[0].text.trim()) {
    throw new NotionRemoteContentError("REMOTE_STRUCTURE_INVALID", "The Notion chapter heading is missing or ambiguous.");
  }

  const scenes: Array<{ title: string; paragraphs: string[] }> = [];
  let current: { title: string; paragraphs: string[] } | null = null;
  for (const block of parsed) {
    if (block.type === "heading_2") {
      const title = block.text.trim();
      if (!title) throw new NotionRemoteContentError("REMOTE_STRUCTURE_INVALID", "A Notion scene heading is empty.");
      current = { title, paragraphs: [] };
      scenes.push(current);
    } else if (block.type === "paragraph" && current) {
      current.paragraphs.push(block.text);
    }
  }

  if (scenes.length !== localScenes.length) {
    throw new NotionRemoteContentError("REMOTE_STRUCTURE_INVALID", "The Notion scene structure does not match the local chapter.");
  }

  return {
    chapterTitle: chapterHeadings[0].text.replace(/^\d{2}\.\d{2}\s+—\s+/, "").trim(),
    scenes: scenes.map((scene, index) => {
      const paragraphs =
        scene.paragraphs[0] === localScenes[index]?.summary
          ? scene.paragraphs.slice(1)
          : scene.paragraphs;
      return {
        localSceneId: localScenes[index].id,
        title: scene.title,
        content: paragraphs.join("\n\n"),
        contentState: "complete" as const,
        allowEmptyOverwrite: false
      };
    })
  };
}
