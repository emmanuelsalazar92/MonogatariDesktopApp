import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "monogatari-test-"));
// Keep the CI gate focused on data safety. These integration/unit tests are
// deliberately isolated from visual and exploratory test files so a temporary
// database is always available before a persistence API is imported.
const testFiles = [
  "critical-persistence-api.test.mjs",
  "character-responsive-layout.test.mjs",
  "card-top-right-badges.test.mjs",
  "editor-document-safety.test.mjs",
  "health-readiness.test.mjs",
  "notion-pull-safety.test.mjs",
  "notion-sync-resilience.test.mjs",
  "production-database-migration.test.mjs",
  "novel-lifecycle.test.mjs",
  "place-connections.test.mjs",
  "scene-persistence-sqlite.test.mjs",
  "scene-recovery.test.mjs",
  "safe-restore.test.mjs",
  "sqlite-backup.test.mjs",
  "studio-routes.test.mjs",
  "test-isolation.test.mjs",
  "workspace-context.test.mjs"
].map((name) => join("tests", name));

try {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, ["--test", ...testFiles], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONOGATARI_DATABASE_PATH: join(temporaryDirectory, "monogatari-test.db")
      },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
