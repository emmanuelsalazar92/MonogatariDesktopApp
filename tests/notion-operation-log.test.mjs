import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("Notion operation logs preserve correlation while redacting credentials", () => {
  const source = readFileSync(new URL("../lib/notion-operation-log.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}, entries = [];
  new Function("require", "exports", "module", "console", output)((id) => id === "server-only" ? {} : (() => { throw new Error(`Unexpected module ${id}`); })(), exports, { exports }, { info: (line) => entries.push(line), error: (line) => entries.push(line) });
  exports.logNotionOperation("failed", { operationId: "op-123", operation: "SYNC_NOVEL", direction: "BIDIRECTIONAL", novelId: "novel-1", diagnostic: { operationId: "op-123", timestamp: "now", operation: "SYNC_NOVEL", direction: "BIDIRECTIONAL", stage: "APPEND_BLOCKS", code: "NOTION_ERROR", notionStatus: 400, retrySafe: false, notionApiCode: "validation_error", notionApiMessage: "Bearer private-token", endpoint: "/v1/blocks/page/children" } });
  assert.equal(entries.length, 1);
  assert.match(entries[0], /"operationId":"op-123"/);
  assert.match(entries[0], /"stage":"APPEND_BLOCKS"/);
  assert.match(entries[0], /Bearer: \[redacted\]/);
  assert.equal(entries[0].includes("private-token"), false);
});
