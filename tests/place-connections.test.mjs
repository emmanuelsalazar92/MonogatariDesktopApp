import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
async function loadTs(path, modules = {}) {
  const { outputText } = ts.transpileModule(await readFile(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const result = { exports: {} };
  new Function("require", "exports", "module", outputText)((id) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}

const routes = await loadTs("lib/studio-routes.ts");
const classification = await loadTs("lib/place-classification.ts");
const domain = await loadTs("lib/studio-domain.ts", { "lucide-react": {}, "./place-classification": classification });
const characters = await loadTs("lib/character-place.ts", { "@/lib/studio-domain": domain });
const position = await loadTs("lib/timeline-position.ts");
const timeline = await loadTs("lib/timeline-place.ts", { "@/lib/studio-routes": routes, "./timeline-position": position });

test("Connections renders each Place relationship once, with counts and safe entity links", async () => {
  const element = (tag) => function TestElement({ children, ...props }) { return React.createElement(tag, props, children); };
  const { PlaceConnections } = await loadTs("components/studio/place-connections.tsx", {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: element("a") }, "lucide-react": { MoreHorizontal: () => React.createElement("span", null, "…") },
    "@/components/ui/button": { Button: element("button") },
    "@/components/ui/dialog": { Dialog: ({ children }) => React.createElement("div", null, children), DialogContent: element("div"), DialogDescription: element("p"), DialogFooter: element("footer"), DialogHeader: element("header"), DialogTitle: element("h2") },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/select": { Select: element("div"), SelectTrigger: element("button"), SelectValue: () => null, SelectContent: element("div"), SelectItem: element("div") },
    "@/lib/studio-domain": domain, "@/lib/character-place": characters, "@/lib/timeline-place": timeline, "@/lib/studio-routes": routes
  });
  const markup = renderToStaticMarkup(React.createElement(PlaceConnections, {
    place: { id: "academy", novelId: "novel", linkedScenes: [{ id: "scene-1", label: "Arrival" }, { id: "scene-2", label: "Lesson" }] },
    characters: [{ id: "mina", novelId: "novel", name: "Mina" }, { id: "rio", novelId: "novel", name: "Rio" }, { id: "foreign", novelId: "other", name: "Hidden" }],
    links: [{ characterId: "mina", locationId: "academy", relationshipType: "Lives at" }, { characterId: "rio", locationId: "academy", relationshipType: "Works at" }, { characterId: "foreign", locationId: "academy", relationshipType: "Lives at" }],
    events: [{ id: "event-1", novelId: "novel", locationIds: ["academy"], title: "Orientation", internalDate: "Day 1", sortIndex: 1, isSpoiler: false }, { id: "event-2", novelId: "novel", locationIds: ["academy"], title: "Exam", internalDate: "Day 3", sortIndex: 2, isSpoiler: false }, { id: "foreign-event", novelId: "other", locationIds: ["academy"], title: "Hidden", internalDate: "Day 2", sortIndex: 1, isSpoiler: false }],
    onChanged: async () => {}
  }));
  for (const value of ["Connections", "Characters (2)", "Scenes (2)", "Events (2)", "Mina", "Rio", "Arrival", "Lesson", "Orientation", "Exam", "Edit relationship", "Unlink"]) assert.ok(markup.includes(value), `missing ${value}`);
  assert.equal((markup.match(/>Connections</g) ?? []).length, 1, "there is one structural Connections section");
  assert.match(markup, /href="\/novels\/novel\/characters\/mina"/);
  assert.match(markup, /href="\/novels\/novel\/editor\/scene-2"/);
  assert.match(markup, /href="\/novels\/novel\/timeline\/event-2"/);
  assert.doesNotMatch(markup, /Hidden|Linked scenes|Linked characters|Story Events/);
});

test("Connections has one add dialog and uses the guarded add/unlink contracts for every entity type", async () => {
  const source = await readFile(resolve("components/studio/place-connections.tsx"), "utf8");
  assert.equal((source.match(/<Dialog open modal/g) ?? []).length, 1, "one reusable connection dialog");
  for (const value of [
    'addSceneIds: [selectedId], removeSceneIds: []', 'addSceneIds: [], removeSceneIds: [id]',
    'linked: true, expectedLinked: false', 'linked: false, expectedLinked: true',
    'relationshipType', 'Edit relationship', 'unlink-character', 'unlink-scene', 'unlink-event'
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /Link character|Link scenes|Link event/);
});

test("Place detail composes Connections once and keeps archive/delete in its header overflow", async () => {
  const page = await readFile(resolve("app/page.tsx"), "utf8");
  const detail = page.slice(page.indexOf("function PlaceDetailPanel("), page.indexOf("function RelationshipsScreen("));
  assert.equal((detail.match(/<PlaceConnections/g) ?? []).length, 1);
  assert.doesNotMatch(detail, /<PlaceScenes|<PlaceCharacters|<PlaceStoryEvents/);
  assert.match(detail, /<PlaceLifecycle[^>]*compact/);
  const lifecycle = await readFile(resolve("components/studio/place-lifecycle.tsx"), "utf8");
  assert.match(lifecycle, /compact = false/);
  assert.match(lifecycle, /aria-label="Place actions"/);
  assert.match(lifecycle, /Delete place…/);
});
