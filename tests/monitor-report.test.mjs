import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function formatter() {
  const source = readFileSync(new URL("../lib/monitor-report.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "module", output)(exports, { exports });
  return exports.formatDiagnosticReport;
}

test("diagnostic report is stable, complete, and sanitizes sensitive detail", () => {
  const report = formatter()({
    generatedAt: "2026-09-09T00:00:00.000Z", reportId: "report-1", overall: "warning",
    runtime: { version: "1.2.3", build: "release-12", commit: "abc123", builtAt: "2026-09-08T22:10:00Z", environment: "production", node: "v24.0.0", platform: "linux/arm64", uptimeSeconds: 8040, database: "dev.db", databaseBytes: 42 },
    checks: [{ id: "schema", label: "Database schema", status: "failed", detail: "token=do-not-copy Bearer also-private", action: "Run migration." }, { id: "storage", label: "Storage", status: "healthy", detail: "Ready." }]
  });
  assert.match(report, /Monogatari 1\.2\.3\nBuild: release-12\nCommit: abc123/);
  assert.match(report, /Database schema: FAILED\nStorage: HEALTHY/);
  assert.match(report, /FAILED\nDatabase schema\ntoken: \[redacted\]/);
  assert.match(report, /Generated: 2026-09-09T00:00:00\.000Z\nDiagnostic ID: report-1/);
  assert.equal(report.includes("do-not-copy"), false);
  assert.equal(report.includes("also-private"), false);
});
