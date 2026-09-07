import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function load(path, modules = {}) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const result = { exports: {} };
  new Function("require", "exports", "module", output)((id) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    if (id.startsWith("node:")) return require(id);
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}

const contract = load("lib/export-contract.ts");
const model = load("lib/export-model.ts", { "@/lib/export-contract": contract });
const renderers = load("lib/export-renderers.ts", {
  "@/lib/export-contract": contract,
  "@/lib/export-model": model
});

const request = (overrides = {}) => ({
  novelId: "novel-a",
  exportType: "manuscript",
  scope: "novel",
  scopeId: null,
  format: "markdown",
  options: { includeMetadata: true, includeTableOfContents: true, includeSceneTitles: true },
  ...overrides
});

const exportModel = {
  novel: { id: "novel-a", title: "Árbol <script>", synopsis: "A & B", genre: "Fantasy", tags: ["safe"] },
  scope: { type: "novel", id: "novel-a" },
  volumes: [{ id: "volume-a", title: "Volume", summary: "", sortOrder: 0, chapters: [{
    id: "chapter-a", title: "Chapter", summary: "", sortOrder: 0,
    scenes: [{ id: "scene-a", title: "Opening", content: "Saved manuscript <script>alert(1)</script>", sortOrder: 0 }]
  }] }]
};

test("export request is typed, allowlisted, and never accepts paths or manuscript bodies", () => {
  assert.equal(contract.readExportRequest(request()).ok, true);
  for (const invalid of [
    request({ novelId: "../other" }),
    request({ scope: "chapter", scopeId: "other/../../chapter" }),
    request({ scope: "chapter", scopeId: null }),
    request({ scope: "novel", scopeId: "novel-a" }),
    request({ format: "pdf" }),
    { ...request(), content: "client manuscript" },
    request({ options: { includeMetadata: true, includeTableOfContents: true, includeSceneTitles: true, outputPath: "C:/private" } })
  ]) {
    const parsed = contract.readExportRequest(invalid);
    assert.equal(parsed.ok, false);
  }
});

test("canonical renderers are deterministic and HTML/Markdown neutralize embedded markup", async () => {
  for (const format of ["markdown", "txt", "html"]) {
    const renderer = renderers.canonicalExportRenderers.get(format);
    const first = await renderer.render(exportModel, "manuscript", request().options);
    const second = await renderer.render(exportModel, "manuscript", request().options);
    assert.deepEqual(first.content, second.content);
  }
  const markdown = new TextDecoder().decode((await renderers.canonicalExportRenderers.get("markdown").render(exportModel, "manuscript", request().options)).content);
  const html = new TextDecoder().decode((await renderers.canonicalExportRenderers.get("html").render(exportModel, "manuscript", request().options)).content);
  assert.doesNotMatch(markdown, /<script>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("cross-Novel scope IDs fail closed before any content is returned", async () => {
  const source = load("lib/db/export-source.ts", {
    "server-only": {},
    "@/lib/db/prisma": { prisma: {} },
    "@/lib/export-contract": contract,
    "@/lib/export-model": model
  });
  const database = {
    $transaction: (callback) => callback({
      novel: { findFirst: async () => ({ id: "novel-a", title: "A", synopsis: "", genre: "", tags: "[]" }) },
      volume: {
        findFirst: async ({ where }) => where.id === "foreign-volume" && where.novelId === "novel-b" ? { id: "foreign-volume" } : null
      }
    })
  };
  await assert.rejects(
    source.loadCanonicalExportModel(request({ scope: "volume", scopeId: "foreign-volume" }), database),
    (error) => error.code === "SCOPE_NOT_FOUND" && error.status === 404
  );
});

test("renderer failures are recoverable and always clean their temporary artifact", async () => {
  const serviceModule = load("lib/export-service.ts", {
    "server-only": {},
    "@/lib/export-contract": contract,
    "@/lib/export-model": model,
    "@/lib/export-renderers": { canonicalExportRenderers: new Map() },
    "@/lib/db/export-source": { loadCanonicalExportModel: async () => exportModel }
  });
  let cleaned = 0;
  const service = new serviceModule.ExportService({
    loadModel: async () => exportModel,
    renderers: new Map([["markdown", { format: "markdown", render: async () => { throw new Error("private renderer detail"); } }]]),
    createArtifact: async () => ({ write: async () => {}, read: async () => new Uint8Array(), cleanup: async () => { cleaned += 1; } })
  });
  await assert.rejects(service.export(request()), (error) => error.code === "RENDER_FAILED" && error.recoverable === true && !error.message.includes("private"));
  assert.equal(cleaned, 1);
});

test("the service returns equivalent bytes for the same model and configuration", async () => {
  const serviceModule = load("lib/export-service.ts", {
    "server-only": {},
    "@/lib/export-contract": contract,
    "@/lib/export-model": model,
    "@/lib/export-renderers": { canonicalExportRenderers: renderers.canonicalExportRenderers },
    "@/lib/db/export-source": { loadCanonicalExportModel: async () => exportModel }
  });
  let cleanupCount = 0;
  const createArtifact = async () => {
    let stored = new Uint8Array();
    return {
      write: async (content) => { stored = new Uint8Array(content); },
      read: async () => new Uint8Array(stored),
      cleanup: async () => { cleanupCount += 1; }
    };
  };
  const service = new serviceModule.ExportService({
    loadModel: async () => exportModel,
    renderers: renderers.canonicalExportRenderers,
    createArtifact
  });
  const first = await service.export(request());
  const second = await service.export(request());
  assert.equal(first.filename, second.filename);
  assert.equal(first.contentType, second.contentType);
  assert.deepEqual(first.content, second.content);
  assert.equal(cleanupCount, 2);
});

test("export source performs only bounded canonical reads", () => {
  const source = read("lib/db/export-source.ts");
  const route = read("app/api/exports/route.ts");
  assert.match(source, /\$transaction/);
  assert.match(source, /novelId: request\.novelId/);
  assert.doesNotMatch(source, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  assert.doesNotMatch(source, /outputPath|artifactPath|request\.content/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /X-Content-Type-Options/);
  assert.doesNotMatch(route, /stack|console\./);
});
