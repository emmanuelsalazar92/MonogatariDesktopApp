import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the aggregate test runner gives every test process an OS-temporary database path", () => {
  const runner = read("scripts/run-tests.mjs");
  const prisma = read("lib/db/prisma.ts");

  assert.match(runner, /mkdtemp\(join\(tmpdir\(\), "monogatari-test-"\)\)/);
  assert.match(runner, /MONOGATARI_DATABASE_PATH: join\(temporaryDirectory, "monogatari-test\.db"\)/);
  assert.match(runner, /await rm\(temporaryDirectory, \{ recursive: true, force: true \}\)/);
  assert.match(prisma, /process\.env\.MONOGATARI_DATABASE_PATH/);
  assert.match(prisma, /testProcess && !process\.env\.MONOGATARI_DATABASE_PATH/);
  assert.match(prisma, /Tests require MONOGATARI_DATABASE_PATH/);
  assert.doesNotMatch(runner, /prisma[\\/]dev\.db/);
});
