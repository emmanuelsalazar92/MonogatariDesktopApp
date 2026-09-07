import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);
  return exports;
}

test("Novel metadata is normalized, bounded, and accepts tags only as text", () => {
  const metadata = load("../lib/novel-metadata.ts");
  assert.deepEqual(
    metadata.validateNovelMetadata({
      title: "  El jardín  ", synopsis: "  Private outline ", genre: " Fantasy ",
      tags: [" magic ", "MAGIC", "school"]
    }),
    { ok: true, data: { title: "El jardín", synopsis: "Private outline", genre: "Fantasy", tags: ["magic", "school"] } }
  );
  for (const value of [
    { title: "", synopsis: "", genre: "", tags: [] },
    { title: "Valid", synopsis: "", genre: "", tags: "not a list" },
    { title: "Valid", synopsis: "", genre: "", tags: ["x".repeat(61)] },
    { title: "Valid", synopsis: "", genre: "", tags: [], coverImage: "https://untrusted.example/cover.jpg" }
  ]) assert.equal(metadata.validateNovelMetadata(value).ok, false);
});

test("Current Novel keeps cover identity compact and degrades metadata without lifecycle decoration", () => {
  const overview = readFileSync(new URL("../components/studio/novel-overview-screen.tsx", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../components/studio/shared.tsx", import.meta.url), "utf8");
  assert.match(overview, /<CoverBlock title=\{currentNovel\.title\} coverImage=\{currentNovel\.coverImage\} compact \/>/);
  assert.match(overview, /currentNovel\.genre \|\| "—"/);
  assert.match(overview, /currentNovel\.tags\.length \? <TagList/);
  assert.match(overview, /Edit details/);
  assert.doesNotMatch(overview, /<StatusBadge/);
  assert.match(shared, /object-cover/);
  assert.match(shared, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(shared, /compact \? "h-20 w-14"/);
  assert.doesNotMatch(shared, /BookMarked/);
});

test("Metadata updates are trusted, field-scoped, and leave the manuscript hierarchy untouched", () => {
  const route = readFileSync(new URL("../app/api/novels/[novelId]/route.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const start = db.indexOf("export async function updateNovelMetadata");
  const mutation = db.slice(start, db.indexOf("export async function createCharacter", start));
  assert.match(route, /isTrustedMutationRequest/);
  assert.match(route, /isValidNovelRouteId/);
  assert.match(route, /validateNovelMetadata/);
  assert.match(route, /status: 404/);
  assert.match(mutation, /prisma\.novel\.update/);
  assert.match(mutation, /title: input\.title/);
  assert.match(mutation, /tags: JSON\.stringify\(input\.tags\)/);
  assert.doesNotMatch(mutation, /chapter|scene|volume/i);
});
