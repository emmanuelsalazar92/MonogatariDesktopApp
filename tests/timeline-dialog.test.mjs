import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";
const { readTimelineEvent, createEventSaveLock } = createJiti(import.meta.url)("../lib/timeline-event.ts");
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Event validation rejects blank/long titles, invalid associations and private-field coercion", () => {
  assert.equal(readTimelineEvent({ title: " Event " }).data.title, "Event");
  assert.deepEqual(readTimelineEvent({ title: "Event", characterIds: ["a", "a"] }).data.characterIds, ["a"]);
  for (const input of [{ title: " " }, { title: "a".repeat(201) }, { title: "x", description: 42 }, { title: "x", description: "a".repeat(5001) }, { title: "x", isSpoiler: "false" }, { title: "x", characterIds: [42] }, { title: "x", characterIds: Array(301).fill("a") }, { title: "x", locationId: "../foreign" }]) assert.equal(readTimelineEvent(input).ok, false);
});

test("Synchronous save lock rejects immediate duplicate submits until the whole save/refresh finishes", async () => {
  const lock = createEventSaveLock(); let writes = 0; let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const save = async () => { if (!lock.acquire()) return; try { writes++; await pending; } finally { lock.release(); } };
  const first = save(); await save(); assert.equal(writes, 1); assert.equal(lock.busy, true);
  finish(); await first; assert.equal(lock.busy, false); await save(); assert.equal(writes, 2);
});

test("Add and Edit reuse the opaque bounded modal with labelled Title, optional associations and collapsed Details", () => {
  const element = tag => function Element({ children, ...props }) { return React.createElement(tag, props, children); };
  const modules = { react: React, "react/jsx-runtime": jsxRuntime, "@/lib/timeline-event": { readTimelineEvent, createEventSaveLock },
    "@/components/ui/button": { Button: ({ variant, ...props }) => React.createElement("button", { ...props, "data-variant": variant }) },
    "@/components/ui/input": { Input: element("input") }, "@/components/ui/label": { Label: element("label") }, "@/components/ui/textarea": { Textarea: element("textarea") },
    "@/components/ui/switch": { Switch: ({ checked, disabled, id }) => React.createElement("button", { role: "switch", "aria-checked": checked, disabled, id }) },
    "@/components/ui/select": { Select: ({ children }) => React.createElement("div", null, children), SelectTrigger: element("button"), SelectContent: element("div"), SelectValue: () => null, SelectItem: ({ children }) => React.createElement("span", null, children) },
    "@/components/ui/dialog": { Dialog: ({ children }) => React.createElement("section", null, children), DialogContent: ({ children, className }) => React.createElement("article", { className, role: "dialog", "aria-modal": true }, children), DialogHeader: element("header"), DialogFooter: element("footer"), DialogTitle: element("h2"), DialogDescription: element("p") },
    "./timeline-position-fields": { TimelinePositionFields: () => React.createElement("div", null, "Chronological Position / Story Position") }
  };
  const exported = {};
  const source = read("components/studio/timeline-event-dialog.tsx");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", compiled)(id => modules[id], exported);
  const props = { novelId: "n", options: [], characters: [{ id: "a", novelId: "n", name: "Juana" }, { id: "b", novelId: "other", name: "FOREIGN" }], places: [], onClose() {}, async onSaved() {} };
  for (const event of [undefined, { id: "e", novelId: "n", positionRevision: 1, title: "<script>unsafe</script>", description: "saved notes", internalDate: "", sortIndex: 1024, chronologyKind: "manual", relativeDay: null, relativeMinute: null, volumeId: "", chapterId: "", sceneId: "", locationIds: [], characterIds: ["a"], isSpoiler: false }]) {
    const html = renderToStaticMarkup(React.createElement(exported.TimelineEventDialog, { ...props, event }));
    assert.match(html, /class="relationship-dialog"/); assert.match(html, /aria-modal="true"/); assert.match(html, /Event Title/);
    assert.match(html, /relationship-dialog-header/); assert.match(html, /relationship-dialog-body/); assert.match(html, /relationship-dialog-footer/);
    assert.match(html, /Save Event/); assert.match(html, /Cancel/); assert.match(html, /Linked Characters/); assert.match(html, /Details \(optional\)/);
    assert.doesNotMatch(html, /<details[^>]*\bopen|FOREIGN|<script>/);
    if (event) assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  }
  assert.match(source, /titleRef.current\?\.focus/); assert.match(source, /invoker.focus\(\)/); assert.match(source, /onEscapeKeyDown/);
  assert.match(source, /if \(!committed\)/); assert.match(source, /await onSaved\(\); onClose\(\)/); assert.match(source, /if \(!lock.acquire\(\)\) return/);
  assert.match(source, /role="status"/);
  assert.doesNotMatch(read("app/page.tsx"), /setEventForm|onCreateEvent/);
});
