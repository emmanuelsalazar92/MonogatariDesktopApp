import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function safetyModule() {
  const source = read("lib/notion-pull-safety.ts");
  const exports = {};
  new Function("exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText)(exports);
  return exports;
}

const richText = (plain_text) => [{ plain_text }];
const paragraph = (text) => ({ type: "paragraph", paragraph: { rich_text: richText(text) } });
const heading = (level, text) => ({ type: `heading_${level}`, [`heading_${level}`]: { rich_text: richText(text) } });

test("complete remote empty content remains explicit rather than being treated as an unread body", () => {
  const { parseCompleteNotionChapterBlocks } = safetyModule();
  const parsed = parseCompleteNotionChapterBlocks([
    heading(1, "01.01 — Chapter"),
    heading(2, "01 — Scene")
  ], [{ id: "scene-a", summary: "" }]);

  assert.deepEqual(parsed.scenes, [{
    localSceneId: "scene-a",
    title: "01 — Scene",
    content: "",
    contentState: "complete",
    allowEmptyOverwrite: false
  }]);
});

test("unsupported, nested, and incomplete Notion blocks fail closed", () => {
  const { parseCompleteNotionChapterBlocks, NotionRemoteContentError } = safetyModule();
  const localScenes = [{ id: "scene-a", summary: "" }];

  assert.throws(
    () => parseCompleteNotionChapterBlocks([heading(1, "Chapter"), { type: "to_do", to_do: { rich_text: [] } }], localScenes),
    NotionRemoteContentError
  );
  assert.throws(
    () => parseCompleteNotionChapterBlocks([heading(1, "Chapter"), { ...paragraph("text"), has_children: true }], localScenes),
    NotionRemoteContentError
  );
  assert.throws(
    () => parseCompleteNotionChapterBlocks([{ type: "heading_1", heading_1: {} }], localScenes),
    NotionRemoteContentError
  );
});

test("pagination, destructive-empty conflict, and database application all fail closed", () => {
  const pull = read("lib/notion-pull.ts");
  const apply = read("lib/db/notion-pull.ts");

  assert.match(pull, /typeof page\.next_cursor !== "string" \|\| !page\.next_cursor/);
  assert.match(pull, /seenCursors\.has\(page\.next_cursor\)/);
  assert.match(pull, /parseCompleteNotionChapterBlocks\(remoteRead\.blocks, localScenes\)/);
  assert.match(pull, /DESTRUCTIVE_REMOTE_EMPTY/);
  assert.match(pull, /remote_empty_requires_explicit_resolution/);
  assert.match(apply, /remote\.contentState !== "complete" \|\| remote\.localSceneId !== scene\.id/);
  assert.match(apply, /remote\.content === "" && scene\.content\.trim\(\) !== "" && !remote\.allowEmptyOverwrite/);
  assert.match(apply, /revision: \{ increment: 1 \}/);
});
