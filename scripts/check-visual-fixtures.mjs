import { join, resolve } from "node:path";

import { inspectDevDatabase, visualFixtureIds } from "./dev-database-state.mjs";

const databasePath = process.env.MONOGATARI_DEV_DB_PATH
  ? resolve(process.env.MONOGATARI_DEV_DB_PATH)
  : join(process.cwd(), "prisma", "dev.db");
const state = inspectDevDatabase(databasePath);

if (!state.visualFixturesReady) {
  console.error([
    `Visual QA fixtures are unavailable (${state.status}; ${state.sceneCount} scenes found).`,
    "For a new or empty database, run: npm run setup:dev",
    "To replace an existing development database intentionally, first back it up, then run: npm run setup:dev:reset",
    "setup:dev never overwrites populated narrative data."
  ].join("\n"));
  process.exit(1);
}

console.log(
  `Visual QA fixtures ready: ${visualFixtureIds.novelId}/${visualFixtureIds.chapterId} with ${state.fixtureSceneCount} scenes (${visualFixtureIds.sceneIds.join(", ")}).`
);
