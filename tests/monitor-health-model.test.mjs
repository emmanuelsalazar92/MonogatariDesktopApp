import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function model() {
  const source = readFileSync(new URL("../lib/monitor-health-model.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("exports", "module", output)(exports, { exports }); return exports;
}

const critical = ["database", "sqlite-write", "sqlite-integrity", "prisma", "schema", "storage"];
const notion = ["notion-connectivity", "notion-authentication", "notion-sync-contract", "notion-root-access", "notion-mapping-integrity", "notion-sync-backlog", "notion-rate-limit"];
function checks(overrides = {}) { return [...critical, ...notion, "backup"].map((id) => ({ id, label: id, status: overrides[id] ?? "healthy", detail: `${id} detail` })); }

test("overall health separates optional Notion outages from critical local failures", () => {
  const { deriveMonitorHealth } = model();
  const degraded = deriveMonitorHealth(checks({ "notion-authentication": "failed" }), true);
  assert.equal(degraded.overall, "degraded");
  assert.equal(degraded.capabilities.find((item) => item.id === "notion-sync").status, "unavailable");
  const failed = deriveMonitorHealth(checks({ schema: "failed" }), true);
  assert.equal(failed.overall, "failed");
  assert.equal(failed.capabilities.find((item) => item.id === "local-writing").status, "unavailable");
});

test("overall health supports healthy and unknown states, and ignores a disabled optional integration", () => {
  const { deriveMonitorHealth } = model();
  assert.equal(deriveMonitorHealth(checks(), false).overall, "healthy");
  const unknown = deriveMonitorHealth(checks({ database: "unknown" }), false);
  assert.equal(unknown.overall, "unknown");
  assert.equal(unknown.capabilities.find((item) => item.id === "manual-save").status, "unknown");
});
