import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadDiagnostics() {
  const source = readFileSync(new URL("../lib/notion-diagnostics.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "module", output)(
    (id) => id === "node:crypto" ? { randomUUID: () => "diagnostic-1" } : (() => { throw new Error(`Unexpected module ${id}`); })(),
    exports,
    { exports }
  );
  return exports;
}

test("Notion diagnostics keep safe machine context without error content", () => {
  const { notionDiagnostic } = loadDiagnostics();
  const diagnostic = notionDiagnostic(
    { status: 429, code: "RATE_LIMITED", message: "Bearer secret-local-manuscript" },
    "SYNC_ALL",
    "BIDIRECTIONAL",
    { novelId: "novel-1" }
  );
  assert.deepEqual(diagnostic, {
    operationId: "diagnostic-1",
    timestamp: diagnostic.timestamp,
    direction: "BIDIRECTIONAL",
    operation: "SYNC_ALL",
    stage: "FETCH_REMOTE",
    code: "RATE_LIMITED",
    notionStatus: 429,
    retrySafe: true,
    scope: { novelId: "novel-1" }
  });
  assert.equal(JSON.stringify(diagnostic).includes("secret-local-manuscript"), false);
});

test("unknown errors use a safe generic diagnostic code", () => {
  const { notionDiagnostic } = loadDiagnostics();
  const diagnostic = notionDiagnostic(new Error("token=unsafe"), "PULL_NOVEL", "PULL");
  assert.equal(diagnostic.code, "SYNC_FAILED");
  assert.equal(diagnostic.notionStatus, null);
  assert.equal(diagnostic.retrySafe, true);
  assert.equal(JSON.stringify(diagnostic).includes("unsafe"), false);
});
