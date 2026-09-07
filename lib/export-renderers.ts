import { type ExportFormat, type ExportOptions, type ExportType } from "@/lib/export-contract";
import { escapeExportHtml, escapeMarkdownHtml, type ExportModel } from "@/lib/export-model";

export type RenderedExport = {
  content: Uint8Array;
  contentType: string;
  extension: string;
};

export type ExportRenderer = {
  format: ExportFormat;
  render(model: ExportModel, exportType: ExportType, options: ExportOptions): Promise<RenderedExport>;
};

const encoder = new TextEncoder();

function metadataLines(model: ExportModel) {
  return [
    model.novel.genre ? `Genre: ${model.novel.genre}` : "",
    model.novel.tags.length ? `Tags: ${model.novel.tags.join(", ")}` : "",
    model.novel.synopsis ? `Synopsis: ${model.novel.synopsis}` : ""
  ].filter(Boolean);
}

function textSections(model: ExportModel, exportType: ExportType, options: ExportOptions) {
  const lines: string[] = [model.novel.title];
  if (options.includeMetadata) lines.push("", ...metadataLines(model));
  if (options.includeTableOfContents) {
    lines.push("", "Contents");
    for (const volume of model.volumes) {
      lines.push(volume.title);
      for (const chapter of volume.chapters) lines.push(`  ${chapter.title}`);
    }
  }
  for (const volume of model.volumes) {
    lines.push("", volume.title);
    if (exportType === "outline" && volume.summary) lines.push(volume.summary);
    for (const chapter of volume.chapters) {
      lines.push("", chapter.title);
      if (exportType === "outline") {
        if (chapter.summary) lines.push(chapter.summary);
        for (const scene of chapter.scenes) lines.push(`- ${scene.title}`);
        continue;
      }
      for (const scene of chapter.scenes) {
        if (options.includeSceneTitles) lines.push("", scene.title);
        if (scene.content) lines.push("", scene.content);
      }
    }
  }
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

const txtRenderer: ExportRenderer = {
  format: "txt",
  async render(model, exportType, options) {
    return { content: encoder.encode(textSections(model, exportType, options)), contentType: "text/plain; charset=utf-8", extension: "txt" };
  }
};

const markdownRenderer: ExportRenderer = {
  format: "markdown",
  async render(model, exportType, options) {
    const lines: string[] = [`# ${escapeMarkdownHtml(model.novel.title)}`];
    if (options.includeMetadata) {
      const metadata = metadataLines(model).map(escapeMarkdownHtml);
      if (metadata.length) lines.push("", ...metadata.map((line) => `> ${line}`));
    }
    if (options.includeTableOfContents) {
      lines.push("", "## Contents");
      for (const volume of model.volumes) {
        lines.push(`- ${escapeMarkdownHtml(volume.title)}`);
        for (const chapter of volume.chapters) lines.push(`  - ${escapeMarkdownHtml(chapter.title)}`);
      }
    }
    for (const volume of model.volumes) {
      lines.push("", `## ${escapeMarkdownHtml(volume.title)}`);
      if (exportType === "outline" && volume.summary) lines.push("", escapeMarkdownHtml(volume.summary));
      for (const chapter of volume.chapters) {
        lines.push("", `### ${escapeMarkdownHtml(chapter.title)}`);
        if (exportType === "outline") {
          if (chapter.summary) lines.push("", escapeMarkdownHtml(chapter.summary));
          for (const scene of chapter.scenes) lines.push(`- ${escapeMarkdownHtml(scene.title)}`);
          continue;
        }
        for (const scene of chapter.scenes) {
          if (options.includeSceneTitles) lines.push("", `#### ${escapeMarkdownHtml(scene.title)}`);
          if (scene.content) lines.push("", escapeMarkdownHtml(scene.content));
        }
      }
    }
    return { content: encoder.encode(lines.join("\n").trimEnd() + "\n"), contentType: "text/markdown; charset=utf-8", extension: "md" };
  }
};

const htmlRenderer: ExportRenderer = {
  format: "html",
  async render(model, exportType, options) {
    const sections: string[] = [`<h1>${escapeExportHtml(model.novel.title)}</h1>`];
    if (options.includeMetadata) {
      const metadata = metadataLines(model);
      if (metadata.length) sections.push(`<dl>${metadata.map((line) => `<div><dd>${escapeExportHtml(line)}</dd></div>`).join("")}</dl>`);
    }
    if (options.includeTableOfContents) {
      sections.push(`<nav aria-label="Contents"><h2>Contents</h2><ol>${model.volumes.map((volume) => `<li>${escapeExportHtml(volume.title)}<ol>${volume.chapters.map((chapter) => `<li>${escapeExportHtml(chapter.title)}</li>`).join("")}</ol></li>`).join("")}</ol></nav>`);
    }
    for (const volume of model.volumes) {
      sections.push(`<section><h2>${escapeExportHtml(volume.title)}</h2>`);
      if (exportType === "outline" && volume.summary) sections.push(`<p>${paragraphs(volume.summary)}</p>`);
      for (const chapter of volume.chapters) {
        sections.push(`<section><h3>${escapeExportHtml(chapter.title)}</h3>`);
        if (exportType === "outline") {
          if (chapter.summary) sections.push(`<p>${paragraphs(chapter.summary)}</p>`);
          sections.push(`<ul>${chapter.scenes.map((scene) => `<li>${escapeExportHtml(scene.title)}</li>`).join("")}</ul>`);
        } else {
          for (const scene of chapter.scenes) {
            if (options.includeSceneTitles) sections.push(`<h4>${escapeExportHtml(scene.title)}</h4>`);
            if (scene.content) sections.push(`<div class="scene">${paragraphs(scene.content)}</div>`);
          }
        }
        sections.push("</section>");
      }
      sections.push("</section>");
    }
    const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeExportHtml(model.novel.title)}</title></head><body><main>${sections.join("")}</main></body></html>`;
    return { content: encoder.encode(document), contentType: "text/html; charset=utf-8", extension: "html" };
  }
};

function paragraphs(value: string) {
  return escapeExportHtml(value).replace(/\r?\n/g, "<br>");
}

export const canonicalExportRenderers: ReadonlyMap<ExportFormat, ExportRenderer> = new Map([
  [markdownRenderer.format, markdownRenderer],
  [txtRenderer.format, txtRenderer],
  [htmlRenderer.format, htmlRenderer]
]);
