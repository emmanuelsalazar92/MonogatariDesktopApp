import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createJiti from "jiti";
const anchor = createJiti(import.meta.url)("../lib/scene-annotation-anchor.ts");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const note = (quotedText, extra = {}) => ({ id: extra.id ?? "note", title: extra.title ?? "Annotation", quotedText, matchable: true, workflowStatus: "informational", ...extra });

test("Exact anchoring resolves unique, missing, multiple and moved quotes without regex", () => {
  const quote = "Akira abrió la puerta", item = note(quote);
  const unique = anchor.resolveSceneAnnotations(`Antes. ${quote}. Después.`, [item])[0];
  assert.equal(unique.status, "anchored"); assert.equal(unique.index, 7);
  assert.deepEqual(anchor.resolveSceneAnnotations("Akira abrió lentamente la puerta", [item]).map(value => [value.status, value.reason]), [["unanchored", "none"]]);
  assert.deepEqual(anchor.resolveSceneAnnotations(`${quote}. Luego ${quote}.`, [item]).map(value => [value.status, value.reason]), [["unanchored", "multiple"]]);
  const moved = anchor.resolveSceneAnnotations(`Nuevo inicio. Texto. ${quote}`, [item])[0];
  assert.equal(moved.status, "anchored"); assert.equal(moved.index, `Nuevo inicio. Texto. `.length);
  assert.equal(anchor.resolveSceneAnnotations("akíra", [note("aki\u0301ra")])[0].status, "anchored", "NFC-normalized literal text matches");
  assert.equal(anchor.resolveSceneAnnotations("AKIRA", [note("Akira")])[0].status, "unanchored", "literal matching remains case-sensitive");
});

test("Matcher is bounded and duplicate Notes may share one unique quote safely", () => {
  const shared = [note("Akira", { id: "one" }), note("Akira", { id: "two" })];
  assert.deepEqual(anchor.resolveSceneAnnotations("Akira arrived", shared).map(item => item.status), ["anchored", "anchored"]);
  assert.equal(anchor.resolveSceneAnnotations("x".repeat(anchor.MAX_ANCHOR_SCENE_LENGTH + 1), [note("x")])[0].reason, "limit");
  assert.equal(anchor.resolveSceneAnnotations("short", [note("x".repeat(anchor.MAX_ANCHOR_QUOTE_LENGTH + 1))])[0].reason, "limit");
});

test("Scene annotation UI is optional, resilient and never persists an anchor", () => {
  const component = read("components/studio/scene-annotations.tsx"), resolver = read("lib/scene-annotation-anchor.ts"), route = read("app/api/scenes/[sceneId]/annotations/route.ts"), repository = read("lib/db/notes.ts");
  assert.match(component, /Annotation markers On/); assert.match(component, /Annotation markers Off/); assert.match(component, /Anchored/); assert.match(component, /Unanchored/);
  assert.match(component, /event\.key === "Escape"/); assert.match(component, /manuscriptRef\.current\?\.focus/); assert.match(component, /Open full Note/); assert.match(component, /abort\.abort\(\)/);
  const query = repository.slice(repository.indexOf("getSceneAnnotationSummaries"), repository.indexOf("export async function writeNote"));
  assert.match(query, /take: 101/); assert.match(query, /quotedText\.slice\(0, 10_000\)/); assert.doesNotMatch(query, /content: true/);
  assert.match(route, /export async function GET/); assert.doesNotMatch(route, /export (?:async )?function (?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch([component, resolver, route].join("\n"), /notion|openai|localStorage\.setItem\([^\n]*(?:index|offset|quotedText)/i);
  assert.doesNotMatch(read("prisma/schema.prisma").slice(read("prisma/schema.prisma").indexOf("model Note"), read("prisma/schema.prisma").indexOf("model Tag")), /offset|startIndex|endIndex|domRange|anchorHtml/i);
});
