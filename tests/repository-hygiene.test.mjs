import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function isIgnored(path) {
  const result = spawnSync("git", ["check-ignore", "--quiet", "--no-index", path], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.ok(
    result.status === 0 || result.status === 1,
    result.stderr || `git check-ignore failed for ${path}`
  );
  return result.status === 0;
}

test("runtime backups are ignored while synthetic fixtures remain versionable", async () => {
  assert.equal(isIgnored("prisma/backups/sqlite-snapshot-test.db"), true);
  assert.equal(isIgnored("tests/fixtures/backups/synthetic-snapshot.db"), false);

  const policy = await readFile(resolve(process.cwd(), "docs/backup-artifacts.md"), "utf8");
  assert.match(policy, /prisma\/backups\//);
  assert.match(policy, /tests\/fixtures\/backups\//);
  assert.match(policy, /private manuscript data/);
});
