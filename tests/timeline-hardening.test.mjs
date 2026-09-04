import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, deps = {}) {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => { if (!(id in deps)) throw new Error(id); return deps[id]; }, exports);
  return exports;
}
const routes = load("lib/studio-routes.ts"), position = load("lib/timeline-position.ts");
const contract = load("lib/timeline-read.ts", { "./studio-routes": routes, "./timeline-position": position });
const row = { id: "event", novelId: "n", title: "Event", isSpoiler: false, sortIndex: 1, positionRevision: 0, characterIds: [], locationIds: [], internalDate: "Day 1", description: "PRIVATE BODY", notes: "PRIVATE NOTES" };
test("Timeline read boundary strips private/unknown fields and rejects malformed, foreign or hidden records", () => {
  const summary = contract.readTimelineSummary(row, "n", false);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE|description|notes/);
  for (const candidate of [null, [], { ...row, id: "../event" }, { ...row, novelId: "b" }, { ...row, isSpoiler: true }, { ...row, isSpoiler: "false" }, { ...row, characterIds: null }, { ...row, locationIds: ["../p"] }]) assert.equal(contract.readTimelineSummary(candidate, "n", false), null);
  const detail = contract.readTimelineDetail(row, "n", "event", false);
  assert.equal(detail.description, "PRIVATE BODY"); assert.equal(Object.hasOwn(detail, "notes"), false);
  assert.equal(contract.readTimelineDetail(row, "n", "wrong", false), null);
  assert.equal(contract.readTimelineDetail({ ...row, description: "x".repeat(5001) }, "n", "event", false), null);
});
test("Invalid legacy time coordinates normalize to bounded, sortable metadata", () => {
  const result = contract.readTimelineSummary({ ...row, sortIndex: Infinity, relativeDay: "yesterday", relativeMinute: NaN, internalDate: {} }, "n", false);
  assert.equal(result.sortIndex, 0); assert.equal(result.relativeDay, null); assert.equal(result.relativeMinute, null); assert.equal(result.internalDate, "");
});
test("1500 events remain reachable while at most 50 cards are mounted per page", () => {
  const events = Array.from({ length: 1500 }, (_, i) => ({ ...row, id: `event-${i}` }));
  const ids = [];
  for (let i = 0; i < 30; i++) { const page = contract.timelineWindow(events, i); assert.equal(page.events.length, 50); ids.push(...page.events.map(e => e.id)); }
  assert.equal(new Set(ids).size, 1500); assert.equal(contract.timelineWindow(events, Infinity).page, 0);
  assert.equal(contract.timelineWindow(events, 99).page, 29);
  const { TimelineWindow } = load("components/studio/timeline-window.tsx", { react: React, "react/jsx-runtime": jsx,
    "@/lib/timeline-read": contract, "@/components/ui/button": { Button: props => React.createElement("button", props) },
    "./timeline-chronology": { TimelineChronology: ({ events }) => React.createElement("ol", null, events.map(event => React.createElement("li", { key: event.id }, event.id))) } });
  const html = renderToStaticMarkup(React.createElement(TimelineWindow, { events }));
  assert.equal((html.match(/<li>/g) ?? []).length, 50); assert.match(html, /Next events/); assert.match(html, /Page 1 of 30/);
});
test("Narrow filters/detail reuse keyboard modal isolation and viewport-safe surface", () => {
  const panel = read("components/studio/timeline-detail-panel.tsx"), page = read("app/page.tsx");
  for (const pattern of [/matchMedia/, /max-width: 1023px/, /<details open=/, /<summary/, /<Dialog open modal/, /relationship-detail-drawer/, /Back to timeline/, /onCloseAutoFocus/, /overflow-y-auto overscroll-contain/, /removeEventListener/]) assert.match(panel, pattern);
  assert.match(page, /sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(page, /timeline-results-heading/);
  const css = read("app/globals.css"); assert.match(css, /height: calc\(100dvh - 1rem\)/);
});
test("Secondary detail errors stay isolated; fetches abort stale work and do not depend on external sync", () => {
  const detail = read("components/studio/timeline-detail-loader.tsx"), catalog = read("components/studio/timeline-catalog-loader.tsx");
  assert.match(detail, /readTimelineDetail/); assert.match(detail, /Retry detail/); assert.match(detail, /detail\?\.key === key/);
  assert.match(catalog, /readTimelineSummary/); assert.match(catalog, /result\?\.key === key/);
  for (const source of [detail, catalog]) { assert.match(source, /controller.abort\(\)/); assert.doesNotMatch(source, /console\.|notion|innerHTML/); }
});
