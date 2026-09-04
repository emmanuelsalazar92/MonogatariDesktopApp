import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jiti = createJiti(import.meta.url), filters = jiti("../lib/note-catalog.ts"), contract = jiti("../lib/note-contract.ts");
const navigation = jiti("../lib/note-navigation.ts");

test("Notes filters allowlist values, bound queries/pages and clear to defaults", () => {
  assert.deepEqual(filters.parseNoteFilters(new URLSearchParams("status=evil&archived=no&entityType=SQL&entity=foreign&tag=../bad&pinned=1&page=-4")), filters.defaultNoteFilters);
  const valid = { ...filters.defaultNoteFilters, search: "%_ ' 日本語", tag: "tag-a", pinned: true, status: "open", archived: "all", entityType: "Character", entity: "juancho", pinnedFirst: true, page: 2 };
  assert.deepEqual(filters.parseNoteFilters(filters.noteFilterParams(valid)), valid);
  assert.equal(filters.noteFilterParams(filters.defaultNoteFilters).toString(), "");
  assert.equal(filters.parseNoteFilters(new URLSearchParams({ search: "x".repeat(500), page: "999999999" })).search.length, 200);
  assert.equal(filters.parseNoteFilters(new URLSearchParams("page=2.5")).page, 1);
  assert.equal(filters.normalizeNoteSearch("A\u0301RBOL 日本語 %_ '"), "árbol 日本語 %_ '");
  const privateSearch = "private %_ ' 日本語";
  assert.equal(filters.decodePrivateNoteSearch(filters.encodePrivateNoteSearch(privateSearch)), privateSearch);
  assert.equal(filters.decodePrivateNoteSearch("%ZZ"), "");
});

function load(result) {
  let state = 0;
  const element = tag => function Element({ children, ...props }) { return React.createElement(tag, props, children); };
  const modules = {
    react: { ...React, useState(initial) { state++; return React.useState(state === 3 ? result : state === 4 ? false : initial); } }, "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() },
    "next/link": { default: ({ scroll, ...props }) => React.createElement("a", { ...props, "data-scroll": scroll }) },
    "@/lib/note-navigation": navigation,
    "./note-detail-dialog": { NoteDetailDialog: ({ noteId }) => React.createElement("section", { "data-selected-note": noteId }) },
    "@/components/ui/button": { Button: ({ variant, ...props }) => React.createElement("button", { ...props, "data-variant": variant }) },
    "@/components/ui/input": { Input: element("input") }, "@/components/ui/label": { Label: element("label") },
    "@/lib/note-contract": contract, "@/lib/note-catalog": filters
  };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read("components/studio/notes-catalog.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
  return exports;
}
const result = { total: 0, matched: 0, items: [], tags: [], hasUntagged: false, page: 1, pages: 1, entityType: "", entities: [] };

test("Empty library and no matches have distinct accessible, functional actions", () => {
  for (const total of [0, 3]) {
    const { NotesEmptyState } = load(); let added = 0, cleared = 0;
    const props = { total, onAdd() { added++; }, onClear() { cleared++; } };
    const html = renderToStaticMarkup(React.createElement(NotesEmptyState, props));
    assert.match(html, total ? /No notes match these filters/ : /No notes yet/);
    assert.match(html, total ? /Clear filters/ : /Add your first note/);
    assert.doesNotMatch(html, /NO-TAGS|no-tags|Untagged/);
    NotesEmptyState(props).props.children.at(-1).props.onClick();
    assert.equal(added, total ? 0 : 1); assert.equal(cleared, total ? 1 : 0);
  }
});

test("Catalog uses labelled combinable controls, conditional Untagged, snippets and escaped text", () => {
  const props = { novelId: "a", version: 0, options: [], onAddNote() {}, onEditNote() {}, onTagsLoaded() {} };
  const empty = renderToStaticMarkup(React.createElement(load(result).NotesCatalog, props));
  for (const label of ["Search title and content", "All tags", "Open", "Resolved", "Archived", "All entity types", "Pinned only", "Clear filters", "Manage reusable tags", "No notes yet"]) assert.ok(empty.includes(label), label);
  assert.doesNotMatch(empty, /Untagged|NO-TAGS|<details[^>]*\bopen/);
  const populated = { ...result, total: 1, matched: 1, hasUntagged: true, items: [{ id: "n", novelId: "a", title: "<script>unsafe</script>", snippet: "short excerpt", content: "PRIVATE FULL BODY", pinned: false, workflowStatus: "open", archivedAt: null, updatedAt: "2026-01-01", revision: 0, tags: [], tagSummaries: [], links: [] }] };
  const html = renderToStaticMarkup(React.createElement(load(populated).NotesCatalog, props));
  assert.match(html, /Untagged/); assert.match(html, /short excerpt/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|PRIVATE FULL BODY/);
  assert.match(html, /Open note:/); assert.doesNotMatch(html, /Open \/ Edit/); assert.match(html, /Notes pages/);
  const informational = { ...populated, items: populated.items.map(item => ({ ...item, workflowStatus: "informational" })) };
  const infoHtml = renderToStaticMarkup(React.createElement(load(informational).NotesCatalog, props));
  assert.match(infoHtml, /Informational/); assert.doesNotMatch(infoHtml, />Resolve<|>Reopen</);
});

test("Catalog debounces and aborts search, isolates detail failures and removes Notes bodies from snapshot", () => {
  const source = read("components/studio/notes-catalog.tsx");
  assert.match(source, /setTimeout\(\(\) => setDebouncedSearch\(filter.search\), 300\)/);
  assert.match(source, /"X-Note-Search": encodePrivateNoteSearch\(debouncedSearch\)/);
  assert.match(source, /noteFilterParams\(\{ \.\.\.filter, search: "" \}\)/);
  assert.match(source, /return \(\) => abort.abort\(\)/);
  assert.match(source, /href={noteCatalogHref\(novelId, filter, note.id\)!}/);
  assert.doesNotMatch(source, /setSelectedNoteId/);
  assert.match(source, /<NoteDetailDialog/);
  assert.match(source, /setDebouncedSearch\(""\)/);
  assert.match(read("components/studio/note-detail-dialog.tsx"), /Close to return to the catalog/);
  assert.doesNotMatch(read("lib/db/studio.ts"), /listNotes\(/);
  assert.doesNotMatch(read("app/page.tsx"), /no-tags|function NotesScreen/);
  const dbSource = read("lib/db/note-catalog.ts");
  assert.match(dbSource, /instr\(n.searchText/); assert.match(dbSource, /LIMIT 50 OFFSET/);
  assert.doesNotMatch(dbSource, /queryRawUnsafe|executeRawUnsafe/);
});

test("Narrow filters use semantic disclosure while desktop keeps the filter grid available", () => {
  const source = read("components/studio/notes-catalog.tsx"), css = read("app/globals.css");
  assert.match(source, /<details className="note-filters/); assert.match(source, /<summary[^>]*>Filters<\/summary>/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*\.note-filters > \.note-filter-fields \{ display: grid; \}/);
});

test("Large Note cards bound title/snippet and render only three tags and attachments", () => {
  const item = { id: "n", novelId: "a", title: "Long title", snippet: "excerpt", updatedAt: "2026-01-01", workflowStatus: "open", tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`), tagSummaries: Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}`, name: `tag-${i}` })), links: Array.from({ length: 500 }, (_, i) => ({ type: "Character", id: `c-${i}`, title: `Character-${i}` })) };
  const html = renderToStaticMarkup(React.createElement(load({ ...result, total: 1, matched: 1, items: [item] }).NotesCatalog, { novelId: "a", options: [], onTagsLoaded() {} }));
  assert.match(html, /line-clamp-2/); assert.match(html, /line-clamp-3/); assert.match(html, /47 tags/); assert.match(html, /497 attachments/);
  assert.doesNotMatch(html, /tag-49|Character-499/);
});

test("Direct URL selection renders detail even when the Note is outside the current catalog page/filter", () => {
  for (const selectedNoteId of ["first", "archived-note", "second", "first"]) {
    const html = renderToStaticMarkup(React.createElement(load(result).NotesCatalog, { novelId: "a", selectedNoteId, version: 0, options: [], onTagsLoaded() {} }));
    assert.match(html, new RegExp(`data-selected-note="${selectedNoteId}"`));
  }
});
