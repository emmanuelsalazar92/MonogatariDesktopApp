import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)(id => { if (!(id in dependencies)) throw new Error(id); return dependencies[id]; }, exports);
  return exports;
}
const position = load("lib/timeline-position.ts"), routes = load("lib/studio-routes.ts");
const chronology = load("lib/timeline-chronology.ts", { "./timeline-position": position, "./studio-routes": routes });
const navigation = load("lib/timeline-navigation.ts", { "./studio-routes": routes });
const storyLink = load("components/studio/timeline-story-link.tsx", { "react/jsx-runtime": jsx, "next/link": { default: props => React.createElement("a", props) }, "@/lib/timeline-navigation": navigation });
const { TimelineChronology } = load("components/studio/timeline-chronology.tsx", {
  "react/jsx-runtime": jsx, "next/link": { default: props => React.createElement("a", props) },
  "@/lib/timeline-chronology": chronology, "@/lib/studio-routes": routes, "./timeline-story-link": storyLink
});
const event = (id, sortIndex, extra = {}) => ({ id, novelId: "n", sortIndex, title: id, internalDate: "Day 3", chronologyKind: "manual", relativeDay: null, relativeMinute: null, volumeId: "", chapterId: "", sceneId: "", characterIds: [], locationIds: [], isSpoiler: false, positionRevision: 0, ...extra });

test("Numeric chronology groups ties by ID independently of labels and Story Position", () => {
  const events = [event("b", 20, { chapterId: "chapter2" }), event("z", 10, { chapterId: "chapter8" }), event("a", 10)];
  const groups = chronology.chronologicalGroups(events, "n");
  assert.deepEqual(groups.map(group => group.events.map(e => e.id)), [["a", "z"], ["b"]]);
  events[1].internalDate = "Third day";
  assert.deepEqual(chronology.chronologicalGroups(events, "n").map(group => group.key), ["10", "20"]);
  assert.equal(events[0].id, "b", "never mutate source order");
  assert.equal(chronology.chronologyLabel(event("relative", 0, { internalDate: "", chronologyKind: "relative", relativeDay: -3, relativeMinute: 65 })), "Day -3 · 01:05");
});

test("Hidden spoilers, foreign and malformed IDs do not contribute groups or counts", () => {
  const rows = [event("public", 1), event("SECRET", 0, { isSpoiler: true }), event("foreign", 2, { novelId: "other" }), event("../invalid", 3)];
  assert.deepEqual(chronology.chronologicalGroups(rows, "n").flatMap(g => g.events.map(e => e.id)), ["public"]);
  assert.equal(chronology.chronologicalGroups(rows, "n", true).length, 2);
  assert.equal(chronology.chronologicalGroups([rows[1]], "n").length, 0);
});

test("Vertical chronology is an ordered list with escaped text, dual positions and semantic deep links", () => {
  const html = renderToStaticMarkup(React.createElement(TimelineChronology, {
    novelId: "n", showSpoilers: false, selectedId: "first", events: [event("second", 20), event("secret", 0, { isSpoiler: true, title: "SECRET" }), event("first", 10, { title: "<script>Arrival</script>", chapterId: "c8", characterIds: ["c"], locationIds: ["p"], description: "PRIVATE BODY" })],
    storyOptions: [{ kind: "chapter", id: "c8", label: "Volume 1 · Chapter 8" }], characters: [{ id: "c", novelId: "n", name: "Juana" }], places: [{ id: "p", novelId: "n", name: "Finca" }]
  }));
  assert.match(html, /<ol aria-label="Chronological events"/);
  assert.match(html, /aria-hidden="true"/); assert.match(html, /aria-current="page"/);
  assert.ok(html.indexOf("Arrival") < html.indexOf(">second<"));
  for (const text of ["When: Day 3", "Told in: Volume 1 · Chapter 8", "/novels/n/timeline/first", "/novels/n/characters/c", "/novels/n/places/p", "&lt;script&gt;"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /SECRET|PRIVATE BODY|<script>/);
});

test("Catalog selects no bodies; detail is on-demand, scoped, cancellable and spoiler guarded", () => {
  const db = read("lib/db/studio.ts"), loader = read("components/studio/timeline-detail-loader.tsx"), page = read("app/page.tsx");
  const query = db.slice(db.indexOf("prisma.timelineEvent.findMany({ select:"), db.indexOf("return rows.map(serializeTimelineEvent)"));
  assert.match(query, /title: true/); assert.doesNotMatch(query, /description|notes/);
  assert.match(db, /where: \{ id, novelId, \.\.\.\(!showSpoilers \? \{ isSpoiler: false \}/);
  assert.match(loader, /controller.abort\(\)/); assert.match(loader, /detail\?\.key === key/);
  assert.match(page, /selectedEvent \? <TimelineDetailPanel/); assert.match(page, /selectedTitle.current\?\.focus/);
});
