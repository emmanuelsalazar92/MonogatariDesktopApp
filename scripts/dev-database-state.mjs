import { existsSync } from "node:fs";

import Database from "better-sqlite3";

export const visualFixtureIds = {
  novelId: "novel-eco-azul",
  chapterId: "ch-1",
  sceneIds: ["scene-1", "scene-2"]
};

const narrativeTables = ["Novel", "Volume", "Chapter", "Scene"];

export function inspectDevDatabase(databasePath) {
  if (!existsSync(databasePath)) {
    return {
      status: "missing",
      narrativeRecordCount: 0,
      novelCount: 0,
      chapterCount: 0,
      sceneCount: 0,
      fixtureSceneCount: 0,
      visualFixturesReady: false
    };
  }

  let database;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    const tables = new Set(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    if (narrativeTables.some((table) => !tables.has(table))) {
      return {
        status: "schema-missing",
        narrativeRecordCount: 0,
        novelCount: 0,
        chapterCount: 0,
        sceneCount: 0,
        fixtureSceneCount: 0,
        visualFixturesReady: false
      };
    }

    const novelCount = database.prepare("SELECT COUNT(*) AS count FROM Novel").get().count;
    const volumeCount = database.prepare("SELECT COUNT(*) AS count FROM Volume").get().count;
    const chapterCount = database.prepare("SELECT COUNT(*) AS count FROM Chapter").get().count;
    const sceneCount = database.prepare("SELECT COUNT(*) AS count FROM Scene").get().count;
    const placeholders = visualFixtureIds.sceneIds.map(() => "?").join(", ");
    const fixtureSceneCount = database.prepare(`
      SELECT COUNT(DISTINCT scene.id) AS count
      FROM Scene AS scene
      INNER JOIN Chapter AS chapter ON chapter.id = scene.chapterId
      INNER JOIN Volume AS volume ON volume.id = chapter.volumeId
      WHERE volume.novelId = ?
        AND chapter.id = ?
        AND scene.id IN (${placeholders})
        AND volume.archived = 0
        AND chapter.archived = 0
        AND scene.archived = 0
    `).get(visualFixtureIds.novelId, visualFixtureIds.chapterId, ...visualFixtureIds.sceneIds).count;

    return {
      status: "available",
      narrativeRecordCount: novelCount + volumeCount + chapterCount + sceneCount,
      novelCount,
      chapterCount,
      sceneCount,
      fixtureSceneCount,
      visualFixturesReady: fixtureSceneCount === visualFixtureIds.sceneIds.length
    };
  } catch (error) {
    return {
      status: "invalid",
      error: error instanceof Error ? error.message : String(error),
      narrativeRecordCount: 0,
      novelCount: 0,
      chapterCount: 0,
      sceneCount: 0,
      fixtureSceneCount: 0,
      visualFixturesReady: false
    };
  } finally {
    database?.close();
  }
}

export function canSeedWithoutReset(state) {
  return state.status === "missing" || state.status === "schema-missing" ||
    (state.status === "available" && state.narrativeRecordCount === 0);
}
