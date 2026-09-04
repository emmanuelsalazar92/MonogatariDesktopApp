import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jiti = createJiti(import.meta.url), routes = jiti("../lib/studio-routes.ts"), navigation = jiti("../lib/note-navigation.ts"), catalog = jiti("../lib/note-catalog.ts");
function load(path, modules) {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
  return exports;
}

test("Note routes round-trip IDs for direct/refresh/history navigation and reject malformed IDs", () => {
  assert.equal(routes.routeForNote("a"), "/novels/a/notes");
  const first = routes.routeForNote("a", "note-first"), second = routes.routeForNote("a", "note-second"), person = routes.routeForCharacter("a", "juancho");
  assert.deepEqual([first, second, person, second, first].map(url => routes.parseStudioRoute(url).noteId ?? "character"), ["note-first", "note-second", "character", "note-second", "note-first"]);
  assert.deepEqual(routes.parseStudioRoute(first), { page: "notes", novelId: "a", noteId: "note-first" });
  for (const url of ["/novels/a/notes/%2Fbad", "/novels/%ZZ/notes/n", "/novels/a/notes/../bad", "/novels/a/notes/%00"]) assert.equal(routes.parseStudioRoute(url), null);
});

test("Navigation allowlists public filter context and never serializes private search/body data", () => {
  const href = navigation.noteCatalogHref("a", { ...catalog.defaultNoteFilters, search: "private content", content: "private body", tag: "tag-a", entityType: "Character", entity: "juancho" }, "note");
  assert.match(href, /^\/novels\/a\/notes\/note\?/); assert.match(href, /entity=juancho/);
  assert.doesNotMatch(href, /private|search|content/);
  assert.equal(navigation.noteCatalogHref("a", catalog.defaultNoteFilters, "../bad"), null);
  assert.equal(navigation.relatedNotesHref("a", { type: "Unknown", id: "x" }), null);
  const related = navigation.relatedNotesHref("a", { type: "Scene", id: "s" }, "n");
  const parsed = new URL(related, "http://localhost");
  assert.equal(routes.parseStudioRoute(parsed.pathname).noteId, "n");
  const filter = catalog.parseNoteFilters(parsed.searchParams); assert.equal(filter.entity, "s"); assert.equal(filter.entityType, "Scene"); assert.equal(filter.archived, "all");
});

test("Server Note page checks ownership before rendering and uses safe not-found for foreign/missing IDs", async () => {
  const calls = [];
  const { default: Page } = load("app/novels/[novelId]/notes/[noteId]/page.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/app/page": { default: "studio" }, "@/lib/studio-routes": routes,
    "@/lib/db/notes": { async noteBelongsToNovelForRoute(novelId, id) { calls.push([novelId, id]); return novelId === "a" && id === "note"; } }
  });
  assert.equal((await Page({ params: Promise.resolve({ novelId: "a", noteId: "note" }) })).type, "studio");
  for (const params of [{ novelId: "b", noteId: "note" }, { novelId: "a", noteId: "missing" }, { novelId: "a", noteId: "../bad" }]) await assert.rejects(Page({ params: Promise.resolve(params) }), /NOT_FOUND/);
  assert.equal(calls.length, 3);
});

test("Related Notes render bounded semantic deep links and snippets, with empty and stale-safe states", () => {
  const target = { novelId: "a", type: "Character", id: "c", title: "Juancho" };
  const item = { id: "n", novelId: "a", title: "<script>Note</script>", snippet: "short excerpt", content: "PRIVATE FULL BODY", archivedAt: null, links: [{ type: "Character", id: "c" }] };
  function render(state) {
    let index = 0;
    const { StoryNotes } = load("components/studio/story-notes.tsx", {
      react: { ...React, useContext: () => 0, useState(initial) { return React.useState(++index === 2 ? state : initial); } }, "react/jsx-runtime": jsxRuntime,
      "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
      "@/components/ui/button": { Button: ({ variant, ...props }) => React.createElement("button", { ...props, "data-variant": variant }) },
      "@/lib/note-navigation": navigation, "@/lib/studio-routes": routes, "./note-capture": { NoteUpdatesContext: {} }
    });
    return renderToStaticMarkup(React.createElement(StoryNotes, { target }));
  }
  const html = render({ key: "a:Character:c", data: { items: [item], matched: 1 } });
  assert.match(html, /href="\/novels\/a\/notes\/n\?/); assert.match(html, /&lt;script&gt;Note/); assert.match(html, /short excerpt/);
  assert.doesNotMatch(html, /<script>|PRIVATE FULL BODY/);
  assert.match(render({ key: "a:Character:c", data: { items: [], matched: 0 } }), /No notes linked/);
  assert.match(render({ key: "a:Character:c", error: true }), /Retry notes/);
  assert.doesNotMatch(render({ key: "b:Character:foreign", data: { items: [item], matched: 1 } }), /short excerpt/);
  const many = render({ key: "a:Character:c", data: { items: Array.from({ length: 50 }, (_, i) => ({ ...item, id: `n-${i}` })), matched: 50 } });
  assert.equal((many.match(/short excerpt/g) ?? []).length, 5); assert.match(many, /View all 50 related notes/);
});

test("Selection comes only from URL; linked navigation does not add an intermediate history entry", () => {
  const page = read("app/page.tsx"), list = read("components/studio/notes-catalog.tsx"), detail = read("components/studio/note-detail-dialog.tsx");
  assert.match(page, /selectedNoteId={activeRoute\?\.noteId}/);
  assert.doesNotMatch(list, /setSelectedNoteId/); assert.match(list, /key={`\$\{novelId\}:\$\{selectedNoteId\}`}/);
  assert.match(list, /onDeleted={\(\) => router.replace/);
  assert.doesNotMatch(detail, /<Link[^>]*onClick={onClose}/);
  assert.match(read("components/studio/story-notes.tsx"), /return \(\) => abort.abort\(\)/);
  assert.match(read("components/studio/characters-screen.tsx"), /<StoryNotes target=/);
  assert.match(read("components/studio/structure-screen.tsx"), /<StoryNotes target=/);
  for (const pattern of [/<StoryNotes target={noteTarget}/, /<StoryNotes target={{ novelId: place.novelId/, /<StoryNotes target={{ novelId: event.novelId/]) assert.match(page, pattern);
});
