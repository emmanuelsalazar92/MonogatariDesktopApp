import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("Novel lifecycle is transactional, reversible, stale-safe and leaves remote data alone", () => {
  const db = read("../lib/db/studio.ts");
  const lifecycleStart = db.indexOf("export async function changeNovelLifecycle");
  const lifecycle = db.slice(lifecycleStart, db.indexOf("function serializeRelationship", lifecycleStart));
  assert.match(lifecycle, /prisma\.\$transaction/);
  assert.match(lifecycle, /existing\.status !== expectedStatus/);
  assert.match(lifecycle, /action === "restore" && existing\.status !== "Archived"/);
  assert.match(lifecycle, /return serializeNovel\(existing\)/);
  assert.match(lifecycle, /novelArchiveStatusSettingKey/);
  assert.match(lifecycle, /appSetting\.upsert/);
  assert.match(lifecycle, /data: \{ status: "Archived" \}/);
  assert.match(lifecycle, /appSetting\.deleteMany/);
  assert.doesNotMatch(lifecycle, /markNotionDirty|notionMapping|tx\.backup|tx\.notion/i);
});

test("Novel lifecycle endpoint requires a trusted, confirmed current-state command", () => {
  const route = read("../app/api/novels/[novelId]/lifecycle/route.ts");
  assert.match(route, /isTrustedMutationRequest/);
  assert.match(route, /isValidNovelRouteId/);
  assert.match(route, /body\.confirmed !== true/);
  assert.match(route, /expectedStatus/);
  assert.match(route, /NovelLifecycleConflictError/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /DELETE|notion|backup/i);
});

test("Archiving Current selects the canonical active fallback or clears selection", () => {
  const db = read("../lib/db/studio.ts");
  const resolverStart = db.indexOf("async function resolveSelectionAfterNovelArchive");
  const resolver = db.slice(resolverStart, db.indexOf("export async function changeNovelLifecycle", resolverStart));
  assert.match(resolver, /status: \{ not: "Archived" \}/);
  assert.match(resolver, /orderBy: \[\{ updatedAt: "desc" \}, \{ id: "asc" \}\]/);
  assert.match(resolver, /activeNovelId/);
  assert.match(resolver, /activeStructureType/);
  assert.match(resolver, /deleteMany/);
  const page = read("../app/page.tsx");
  assert.match(page, /archivingCurrent/);
  assert.match(page, /router\.push\(routeForPage\("library"\)\)/);
  const studioData = read("../lib/studio-data.ts");
  assert.match(studioData, /selected && selected\.status !== "Archived"/);
});

test("Library delegates export, keeps destructive actions in the contextual menu, and confirms archive", () => {
  const card = read("../components/studio/novel-project-card.tsx");
  const dialog = read("../components/studio/novel-lifecycle-dialog.tsx");
  const page = read("../app/page.tsx");
  assert.match(card, /role="menu"/);
  assert.match(card, /onKeyDown/);
  assert.match(card, /event\.key === "Escape"/);
  assert.match(card, /ArrowDown/);
  assert.match(card, /onExportNovel/);
  assert.match(card, /onArchiveNovel/);
  assert.match(card, /onRestoreNovel/);
  assert.doesNotMatch(card, /Duplicate|Delete/);
  assert.match(page, /setActiveNovel\(novelId, "export"\)/);
  assert.match(page, /confirmed: true/);
  assert.match(page, /expectedStatus: novelLifecycleTarget\.novel\.status/);
  assert.match(page, /refreshStudioData\(false\)/);
  assert.match(dialog, /manuscript, structure, metadata, Notion mapping, and backups will be kept/);
  assert.match(dialog, /closeDisabled=\{saving\}/);
});
