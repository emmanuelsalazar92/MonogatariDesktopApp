import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExportError, type ExportFormat, type ExportRequest, type ExportResult } from "@/lib/export-contract";
import { safeExportFilename, type ExportModel } from "@/lib/export-model";
import { canonicalExportRenderers, type ExportRenderer } from "@/lib/export-renderers";
import { loadCanonicalExportModel } from "@/lib/db/export-source";

export type TemporaryExportArtifact = {
  write(content: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array>;
  cleanup(): Promise<void>;
};

export type ExportServiceDependencies = {
  loadModel: (request: ExportRequest) => Promise<ExportModel>;
  renderers: ReadonlyMap<ExportFormat, ExportRenderer>;
  createArtifact: (extension: string) => Promise<TemporaryExportArtifact>;
};

export class ExportService {
  constructor(private readonly dependencies: ExportServiceDependencies) {}

  async export(request: ExportRequest): Promise<ExportResult> {
    const renderer = this.dependencies.renderers.get(request.format);
    if (!renderer) throw new ExportError("UNSUPPORTED_FORMAT", "Export format is not available.", 400);

    const model = await this.dependencies.loadModel(request);
    let artifact: TemporaryExportArtifact;
    try {
      artifact = await this.dependencies.createArtifact(extensionFor(request.format));
    } catch {
      throw new ExportError("ARTIFACT_FAILED", "Could not prepare the temporary export.", 500);
    }

    let result: ExportResult | null = null;
    let failure: ExportError | null = null;
    try {
      let rendered;
      try {
        rendered = await renderer.render(model, request.exportType, request.options);
      } catch {
        throw new ExportError("RENDER_FAILED", "The export renderer could not generate this file.", 500);
      }
      await artifact.write(rendered.content);
      const content = await artifact.read();
      const scopeSuffix = request.scope === "novel" ? "" : `-${request.scope}`;
      result = {
        filename: `${safeExportFilename(model.novel.title)}${scopeSuffix}.${rendered.extension}`,
        contentType: rendered.contentType,
        byteLength: content.byteLength,
        content
      };
    } catch (error) {
      failure = error instanceof ExportError
        ? error
        : new ExportError("ARTIFACT_FAILED", "Could not finalize the temporary export.", 500);
    }

    try {
      await artifact.cleanup();
    } catch {
      if (!failure) failure = new ExportError("ARTIFACT_FAILED", "Could not clean up the temporary export.", 500);
    }
    if (failure) throw failure;
    return result!;
  }
}

function extensionFor(format: ExportFormat) {
  return format === "markdown" ? "md" : format;
}

export async function createTemporaryExportArtifact(extension: string): Promise<TemporaryExportArtifact> {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-export-"));
  const artifactPath = join(directory, `artifact.${extension}`);
  return {
    write: (content) => writeFile(artifactPath, content),
    read: async () => new Uint8Array(await readFile(artifactPath)),
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}

export const canonicalExportService = new ExportService({
  loadModel: loadCanonicalExportModel,
  renderers: canonicalExportRenderers,
  createArtifact: createTemporaryExportArtifact
});
