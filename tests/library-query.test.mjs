import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const source = readFileSync(new URL("../lib/studio-library-navigation.ts", import.meta.url), "utf8");
const exports = {};
new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => ({
  statusFilters: ["All statuses", "Idea", "Planning", "Writing", "Revision", "Complete", "Archived"],
  genreFilters: ["All genres", "Fantasy"]
}), exports);
const { filterAndSortNovels, defaultLibraryNavigationState: defaults, parseLibraryNavigationState: parse, serializeLibraryNavigationState: serialize, boundedLibrarySearch, libraryGenres } = exports;
const make = (id, title, extra = {}) => ({ id, title, status: "Writing", genre: "Fantasy", wordCount: 100, createdAt: "2026-01-01", updatedAt: "2026-09-01", ...extra });
const novels = [make("b", "La Academia del Eco Azul"), make("a", "El reloj", { genre: "Mystery", wordCount: 20 }), make("c", "Café 月", { status: "Planning" }), make("d", "Archived Academia", { status: "Archived", updatedAt: "2026-09-05" })];
const ids = items => items.map(n => n.id);

test("Title search is literal, case-insensitive, Unicode-normalized and bounded", () => {
  assert.deepEqual(ids(filterAndSortNovels(novels, "ACADEMIA", defaults)), ["b"]);
  assert.deepEqual(ids(filterAndSortNovels(novels, "Cafe\u0301", defaults)), ["c"]);
  assert.deepEqual(ids(filterAndSortNovels(novels, "月", defaults)), ["c"]);
  assert.deepEqual(ids(filterAndSortNovels(novels, "ＡＣＡＤＥＭＩＡ", defaults)), ["b"]);
  assert.deepEqual(filterAndSortNovels(novels, ".*|<script>", defaults), []);
  assert.equal(Array.from(boundedLibrarySearch("月".repeat(1000))).length, 160);
});

test("Status, exact canonical genre and lifecycle intersect without mutating source", () => {
  const before = JSON.stringify(novels);
  assert.deepEqual(ids(filterAndSortNovels(novels, "", { ...defaults, status: "Writing", genre: "Fantasy" })), ["b"]);
  assert.deepEqual(ids(filterAndSortNovels(novels, "", { ...defaults, lifecycle: "archived" })), ["d"]);
  assert.deepEqual(ids(filterAndSortNovels([...novels, make("e", "Dark", { genre: "Dark Fantasy" })], "", { ...defaults, genre: "Fantasy", status: "Writing" })), ["b"]);
  assert.equal(JSON.stringify(novels), before);
  assert.deepEqual(libraryGenres([...novels, make("e", "Unknown", { genre: "" }), make("f", "Duplicate", { genre: "fantasy" })]), ["All genres", "Fantasy", "Mystery"]);
});

test("Every sort is stable and default is last edited descending", () => {
  const data = [make("c", "Novel 10", { wordCount: 300, createdAt: "2026-03-01" }), make("b", "Novel 2", { wordCount: 200, updatedAt: "2026-09-03" }), make("a", "Novel 2", { wordCount: 200, updatedAt: "2026-09-03" })];
  assert.deepEqual(ids(filterAndSortNovels(data, "", defaults)), ["a", "b", "c"]);
  assert.deepEqual(ids(filterAndSortNovels(data, "", { ...defaults, sort: "title" })), ["a", "b", "c"]);
  for (const sort of ["words", "created"]) assert.deepEqual(ids(filterAndSortNovels(data, "", { ...defaults, sort })), ["c", "a", "b"]);
  for (const sort of exports.librarySortOptions) assert.deepEqual(ids(filterAndSortNovels([...data].reverse(), "", { ...defaults, sort })), ids(filterAndSortNovels(data, "", { ...defaults, sort })));
});

test("URLs restore allowlisted filters and sort, never private search or view", () => {
  const state = parse(new URLSearchParams("status=writing&genre=fantasy&sort=words&q=secret&view=list"));
  assert.deepEqual(state, { lifecycle: "active", status: "Writing", genre: "Fantasy", sort: "words" });
  assert.equal(serialize(state).toString(), "status=writing&genre=fantasy&sort=words");
  assert.deepEqual(parse(serialize(state)), state);
  assert.deepEqual(parse(new URLSearchParams("status=archived")), { ...defaults, lifecycle: "archived" });
  assert.deepEqual(parse(new URLSearchParams("status=evil&sort=invalid&lifecycle=unknown&genre=unknown")), defaults);
  for (const genre of ["Sci Fi", "Sci-Fi", "幻想 & 魔法"]) {
    const genres = ["All genres", "Sci Fi", "Sci-Fi", "幻想 & 魔法"];
    assert.equal(parse(serialize({ ...defaults, genre }), genres).genre, genre);
  }
});

test("100-project filtering stays synchronous and immediate without debounce or remote work", t => {
  const data = Array.from({ length: 100 }, (_, i) => make(`novel-${i}`, `Project ${i}`, { wordCount: i * 100, status: i % 4 ? "Writing" : "Archived" }));
  const before = JSON.stringify(data);
  const started = performance.now();
  for (let i = 0; i < 1000; i++) filterAndSortNovels(data, "project", { ...defaults, sort: "words" });
  const elapsed = performance.now() - started;
  t.diagnostic(`1000 queries over 100 projects: ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < 2000);
  assert.equal(JSON.stringify(data), before);
  assert.doesNotMatch(source, /fetch\(|setTimeout|setInterval|localStorage|Notion/);
});
