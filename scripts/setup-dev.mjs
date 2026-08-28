import { existsSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { canSeedWithoutReset, inspectDevDatabase } from "./dev-database-state.mjs";

const projectRoot = process.cwd();
const databasePath = join(projectRoot, "prisma", "dev.db");
const npmCliPath = process.env.npm_execpath;

if (!npmCliPath) {
  console.error("Run the bootstrap through npm: npm run setup:dev");
  process.exit(1);
}

function runNpmScript(script) {
  const result = spawnSync(process.execPath, [npmCliPath, "run", script], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNpmScript("db:generate");

if (!existsSync(databasePath)) {
  await mkdir(dirname(databasePath), { recursive: true });
  const emptyDatabase = await open(databasePath, "a");
  await emptyDatabase.close();
  console.log("Created an empty local SQLite file for the initial schema push.");
}

runNpmScript("db:push");

const initialState = inspectDevDatabase(databasePath);
if (canSeedWithoutReset(initialState)) {
  console.log("No narrative records found; loading the stable development fixtures.");
  runNpmScript("db:seed");
} else {
  console.log(`Existing narrative data detected (${initialState.novelCount} novels, ${initialState.sceneCount} scenes); seed skipped.`);
}

const finalState = inspectDevDatabase(databasePath);
if (!finalState.visualFixturesReady) {
  console.error([
    "Development schema is ready, but the visual QA fixtures are missing.",
    "Existing narrative data was preserved and no destructive seed was run.",
    "Back up any local content before explicitly running: npm run setup:dev:reset"
  ].join("\n"));
  process.exit(1);
}

console.log(`Development environment ready: ${finalState.novelCount} novels, ${finalState.chapterCount} chapters, ${finalState.sceneCount} scenes.`);
