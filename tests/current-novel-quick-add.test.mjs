import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Current Novel deliberately has no duplicate Quick Add or navigation action collection", () => {
  const overview = read("../components/studio/novel-overview-screen.tsx");

  for (const label of ["Quick Add", "Quick actions", "Open Editor", "Open Reader", "Export"]) {
    assert.doesNotMatch(overview, new RegExp(label));
  }
  assert.doesNotMatch(overview, /quick-capture|SelectionCaptureMenu|CharacterFormDialog|PlaceFormDialog|NoteFormDialog|fetch\(/i);
  assert.match(overview, /href=\{routeForPage\("structure", currentNovel\.id\)\}/);
});

test("Structure remains the canonical creation flow and requires an explicit valid parent", () => {
  const screen = read("../components/studio/structure-screen.tsx");
  const route = read("../app/api/structure/route.ts");
  const repository = read("../lib/db/structure.ts");

  assert.match(screen, /const openCreate = \(type: StructureItemType, parent\?: StructureCreateParent\)/);
  assert.match(screen, /if \(!destination\?\.id \|\| destination\.type !== expectedParentType\)/);
  assert.match(screen, /if \(dialogMode === "create" && !createParent\?\.id\)/);
  assert.match(screen, /parentId: createParent\?\.id/);
  assert.match(screen, /setCreateParent\(null\)/);

  assert.match(route, /parentId is required/);
  assert.match(repository, /volume\.novelId !== input\.novelId/);
  assert.match(repository, /chapter\.volume\.novelId !== input\.novelId/);
  assert.match(repository, /isDirty: true, revision: \{ increment: 1 \}/);
});

test("Editor-owned contextual capture stays outside Current Novel", () => {
  const overview = read("../components/studio/novel-overview-screen.tsx");
  const capture = read("../components/studio/selection-capture-menu.tsx");
  const endpoint = read("../app/api/quick-capture/route.ts");

  assert.doesNotMatch(overview, /Add as (Character|Place|Note)|Quick Capture/);
  assert.match(capture, /sceneId/);
  assert.match(endpoint, /sceneBelongsToNovel\(sceneId, novelId\)/);
});
