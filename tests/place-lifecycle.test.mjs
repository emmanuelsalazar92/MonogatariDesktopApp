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
const lifecycle = await loadTs("lib/place-lifecycle.ts");
const zero = { children: 0, scenes: 0, characters: 0, events: 0 };

test("Place lifecycle requires explicit confirmation, revision and allowlisted impact counts", () => {
  assert.deepEqual(lifecycle.readPlaceLifecycleConfirmation({ confirmed: true, revision: 2 }), { revision: 2 });
  assert.deepEqual(lifecycle.readPlaceDeleteConfirmation({ confirmed: true, revision: 2, impact: zero }), { revision: 2, impact: zero });
  for (const value of [null, [], {}, { revision: 1 }, { confirmed: false, revision: 1 }, { confirmed: true, revision: -1 }, { confirmed: true, revision: 1.5 }, { confirmed: true, revision: "1" }, { confirmed: true, revision: 1, status: "active" }]) {
    assert.equal(lifecycle.readPlaceLifecycleConfirmation(value), null);
  }
  for (const impact of [null, [], {}, { ...zero, scenes: -1 }, { ...zero, events: 0.5 }, { ...zero, characters: "0" }, { ...zero, children: Number.MAX_SAFE_INTEGER + 1 }, { ...zero, canDelete: true }]) {
    assert.equal(lifecycle.readPlaceDeleteConfirmation({ confirmed: true, revision: 0, impact }), null);
  }
});

test("Any child, scene, character or event reference blocks hard delete", () => {
  assert.equal(lifecycle.canDeletePlace(zero), true);
  for (const kind of lifecycle.placeImpactKeys) assert.equal(lifecycle.canDeletePlace({ ...zero, [kind]: 1 }), false);
  assert.equal(lifecycle.canDeletePlace({}), false);
});

test("Place lifecycle UI shows recoverable actions and the full impact without rendering private fields", async () => {
  const element = (tag) => function TestElement({ children }) { return React.createElement(tag, null, children); };
  const { PlaceLifecycle, PlaceDeleteImpactSummary } = await loadTs("components/studio/place-lifecycle.tsx", {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": { useRouter: () => ({ replace: () => {} }) },
    "@/components/ui/button": { Button: element("button") },
    "@/components/ui/dialog": { Dialog: ({ open, children }) => open ? children : null, DialogContent: element("div"), DialogHeader: element("header"), DialogFooter: element("footer"), DialogTitle: element("h2"), DialogDescription: element("p") },
    "@/components/studio/shared": { FieldLine: ({ label, value }) => React.createElement("p", null, `${label}: ${value}`) },
    "@/lib/place-catalog": {}, "@/lib/place-lifecycle": lifecycle
  });
  const props = { place: { id: "p", novelId: "a", name: "Place", status: "active" }, catalogState: {}, onChanged: async () => {} };
  const active = renderToStaticMarkup(React.createElement(PlaceLifecycle, props));
  assert.match(active, /Archive place/);
  assert.match(active, /Delete place…/);
  assert.doesNotMatch(active, /Delete permanently/);
  const archived = renderToStaticMarkup(React.createElement(PlaceLifecycle, { ...props, place: { ...props.place, status: "archived" } }));
  assert.match(archived, /Restore place/);
  assert.doesNotMatch(archived, /Archive place/);
  const summary = renderToStaticMarkup(React.createElement(PlaceDeleteImpactSummary, { impact: { ...zero, scenes: 12, children: 2, characters: 3, events: 4, canDelete: false, notes: "private" } }));
  for (const value of ["Child places: 2", "Linked scenes: 12", "Linked characters: 3", "Timeline events: 4", "Archive it instead", "Children will not be deleted or moved"]) assert.ok(summary.includes(value));
  assert.doesNotMatch(summary, /private/);
});

test("Delete preview is read-only and mutation requires a loaded impact and a separate confirmation", async () => {
  const ui = await readFile(resolve("components/studio/place-lifecycle.tsx"), "utf8");
  assert.match(ui, /\/impact\$\{query\}.*cache: "no-store"/);
  assert.match(ui, /open\("delete", event.currentTarget\)/);
  assert.match(ui, /confirmed: true, revision: impact.revision/);
  assert.match(ui, /action === "delete" && !impact.canDelete/);
  assert.match(ui, /onClick=\{\(\) => void run\(\)\}/);
  assert.match(ui, /closeDisabled=\{pending\}/);
  assert.match(ui, /onCloseAutoFocus/);
  const repository = await readFile(resolve("lib/db/places.ts"), "utf8");
  const deletion = repository.slice(repository.indexOf("export async function deletePlace"));
  assert.ok(deletion.indexOf("updateMany") < deletion.indexOf("readPlaceDeleteImpact"));
  assert.ok(deletion.indexOf("!impact.canDelete") < deletion.indexOf("tx.location.delete"));
  assert.doesNotMatch(deletion, /tx\.(scene|character|timelineEvent|scenePlace|characterPlace)\.(delete|update)/);
});
