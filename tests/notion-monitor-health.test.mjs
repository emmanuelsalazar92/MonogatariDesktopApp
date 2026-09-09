import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function classify() {
  const source = readFileSync(new URL("../lib/notion-monitor-health.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("exports", "module", output)(exports, { exports }); return exports;
}

test("Notion health separates transport, auth, and sync contract failures", () => {
  const { classifyNotionHealth: health, classifyNotionRootAccess: root } = classify();
  for (const code of ["OFFLINE", "TIMEOUT"]) assert.equal(health({ code, responseReceived: false })[0].status, "failed");
  const validation = health({ status: 400, responseReceived: true, notionApiCode: "validation_error" });
  assert.equal(validation[0].status, "healthy"); assert.equal(validation[2].status, "failed"); assert.match(validation[2].detail, /validation_error/);
  const unauthorized = health({ status: 401, responseReceived: true }); assert.equal(unauthorized[0].status, "healthy"); assert.equal(unauthorized[1].status, "failed");
  const forbidden = health({ status: 403, responseReceived: true }); assert.equal(forbidden[1].label, "Notion authorization");
  const limited = health({ status: 429, responseReceived: true }); assert.equal(limited[0].status, "healthy"); assert.equal(limited[2].status, "warning");
  const server = health({ status: 500, responseReceived: true }); assert.equal(server[0].status, "healthy"); assert.equal(server[2].status, "warning");
  assert.equal(health()[1].status, "healthy");
  assert.equal(root().status, "healthy");
  assert.equal(root({ status: 404, responseReceived: true }).status, "failed");
  assert.match(root({ status: 404, responseReceived: true }).detail, /cannot access/);
  assert.equal(root({ code: "TIMEOUT", responseReceived: false }).status, "unknown");
});
