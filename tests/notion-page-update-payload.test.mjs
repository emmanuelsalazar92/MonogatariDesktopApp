import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function payloadBuilder() {
  const source = readFileSync(new URL("../lib/notion-page-update-payload.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("exports", "module", output)(exports, { exports }); return exports.buildNotionPageUpdatePayload;
}

test("normal Notion UPDATE_PAGE payloads omit archive state and optional defaults", () => {
  const build = payloadBuilder();
  const payload = build({ title: { title: [{ type: "text", text: { content: "Scene" } }] } });
  assert.deepEqual(payload, { properties: { title: { title: [{ type: "text", text: { content: "Scene" } }] } } });
  assert.equal(Object.hasOwn(payload, "archived"), false);
  assert.equal(Object.hasOwn(payload, "erase_content"), false);
  assert.deepEqual(build({ title: {} }, { eraseContent: true }), { properties: { title: {} }, erase_content: true });
});

test("only an explicit archive operation sends archived true, and all sync paths share the builder", () => {
  const build = payloadBuilder();
  assert.deepEqual(build({}, { archived: true }), { properties: {}, archived: true });
  const publish = readFileSync(new URL("../lib/notion-publish.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../app/api/integrations/notion/sync/route.ts", import.meta.url), "utf8");
  const syncAll = readFileSync(new URL("../app/api/integrations/notion/sync-all/route.ts", import.meta.url), "utf8");
  assert.match(publish, /buildNotionPageUpdatePayload\(/);
  assert.doesNotMatch(publish, /archived:\s*false/);
  assert.match(sync, /syncNovelToNotion/);
  assert.match(syncAll, /syncAllConnectedNovels/);
});
