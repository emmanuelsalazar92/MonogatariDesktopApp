import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(path, modules = {}) {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  return exports;
}
const { novelWritingTargets } = load("../lib/novel-writing-target.ts");
const routes = load("../lib/studio-routes.ts");
const div = ({ children, ...props }) => React.createElement("div", props, children);
const { NovelProjectCard } = load("../components/studio/novel-project-card.tsx", {
  "react/jsx-runtime": jsx,
  "next/link": { default: ({ prefetch, ...props }) => { void prefetch; return React.createElement("a", props); } },
  "lucide-react": { Archive: () => null, BookOpen: () => null, Download: () => null, Ellipsis: () => null, PenLine: () => null, RotateCcw: () => null },
  "@/components/ui/button": { Button: ({ children, asChild, className }) => { assert.ok(asChild); return React.cloneElement(children, { className }); } },
  "@/components/ui/badge": { Badge: ({ children, ...props }) => React.createElement("span", props, children) },
  "@/components/ui/card": { Card: div, CardContent: div },
  "@/components/studio/shared": { StatusBadge: ({ status }) => React.createElement("span", null, status) },
  "@/lib/studio-data": { formatNumber: value => value.toLocaleString("en-US") },
  "@/lib/studio-routes": routes
});
const novel = { id: "novel-one", title: "Sombra Bajo la Lluvia " + "UnbrokenLongTitle".repeat(15), status: "Writing", wordCount: 123456789, updatedAt: "2026-09-05" };
export function renderLongCard(view = "grid") {
  return renderToStaticMarkup(React.createElement(NovelProjectCard, { novel, metrics: { volumeCount: 123456, chapterCount: 999999 }, writingSceneId: "scene-two", view, onExportNovel: () => {}, translate: x => x }));
}

test("Novel card has independent read-only links, bounded long title and only two metadata lines", () => {
  const html = renderLongCard();
  assert.equal((html.match(/<a /g) ?? []).length, 4);
  assert.equal((html.match(/<p /g) ?? []).length, 2);
  assert.match(html, /href="\/novels\/novel-one"/);
  assert.match(html, /href="\/novels\/novel-one\/editor\/scene-two"/);
  assert.match(html, /after:absolute after:inset-0/);
  assert.match(html, /relative z-10/);
  assert.match(html, /line-clamp-2 break-words/);
  assert.match(html, /p-5 !pt-5/);
  assert.match(html, /123,456 Volumes · 999,999 Chapters · 123,456,789 Words/);
  assert.match(html, /<time dateTime="2026-09-05">/);
  assert.match(html, /role="menu"/);
  assert.match(html, /Export|Archive/);
  assert.doesNotMatch(html, /Delete|synopsis/);
  const empty = renderToStaticMarkup(React.createElement(NovelProjectCard, { novel, translate: x => x }));
  assert.equal((empty.match(/<a /g) ?? []).length, 3);
  assert.match(empty, /Open project/);
  assert.doesNotMatch(empty, /Continue writing|\/editor/);
});

test("Novel card exposes compact canonical current and local Notion state without actions", () => {
  const html = renderToStaticMarkup(React.createElement(NovelProjectCard, {
    novel,
    metrics: { volumeCount: 1, chapterCount: 2 },
    isCurrent: true,
    notionStatus: "Remote changes",
    lastSuccessfulNotionSync: "2026-09-05T12:00:00.000Z",
    translate: x => x
  }));
  assert.match(html, /Current/);
  assert.match(html, /Remote changes/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Notion status: Remote changes"/);
  assert.match(html, /Last successful sync: 2026-09-05 12:00 UTC/);
});

test("Library hardening keeps metadata-only loading, retry and keyboard menu semantics local", () => {
  const api = readFileSync(new URL("../app/api/studio/route.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const library = readFileSync(new URL("../components/studio/library-screen.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../components/studio/novel-project-card.tsx", import.meta.url), "utf8");
  assert.match(api, /surface"\) === "library"/);
  assert.match(api, /includeActiveSceneContent: !librarySurface/);
  assert.match(db, /options\.includeActiveSceneContent === false/);
  assert.match(db, /activeSceneContentId/);
  assert.match(db, /novelId: options\.activeSceneNovelId/);
  assert.match(library, /loadError/);
  assert.match(library, /onRetry/);
  assert.match(card, /ArrowDown/);
  assert.match(card, /querySelectorAll<HTMLElement>\('\[role="menuitem"\]'\)/);
  assert.doesNotMatch(library, /fetch\(|setTimeout|setInterval/);
});

test("Writing targets follow recent valid local activity and exclude archived or foreign hierarchy", () => {
  const data = { novels: [novel, { id: "empty", status: "Idea" }, { id: "archived", status: "Archived" }],
    volumes: [{ id: "volume", novelId: novel.id, sortOrder: 0 }, { id: "hidden", novelId: novel.id, archived: true }, { id: "foreign", novelId: "other" }],
    chapters: [{ id: "chapter", volumeId: "volume", sortOrder: 0 }, { id: "hiddenChapter", volumeId: "hidden" }, { id: "archivedChapter", volumeId: "volume", archived: true }, { id: "foreignChapter", volumeId: "foreign" }],
    scenes: [{ id: "scene-one", chapterId: "chapter", sortOrder: 0 }, { id: "scene-two", chapterId: "chapter", sortOrder: 1 }, { id: "hidden", chapterId: "hiddenChapter" }, { id: "hidden2", chapterId: "archivedChapter" }, { id: "archived", chapterId: "chapter", archived: true }, { id: "foreign", chapterId: "foreignChapter" }],
    writingActivities: ["scene-two", "hidden", "hidden2", "archived", "foreign"].map((sceneId, i) => ({ id: String(i), novelId: novel.id, sceneId, createdAt: `2026-09-0${i + 1}` })) };
  assert.deepEqual(novelWritingTargets(data), { [novel.id]: "scene-two", empty: undefined, archived: undefined });
  assert.equal(novelWritingTargets({ ...data, writingActivities: [] })[novel.id], "scene-one");
  assert.equal(novelWritingTargets({ ...data, scenes: [] })[novel.id], undefined);
});

test("Editor route revalidates editable ownership server-side; card has no render-time mutation", () => {
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const guard = db.slice(db.indexOf("export async function sceneBelongsToNovelForRoute"), db.indexOf("export async function characterBelongsToNovelForRoute"));
  assert.match(guard, /archived: false/);
  assert.match(guard, /chapter: \{ archived: false, volume: \{ novelId, archived: false, novel: \{ status: \{ not: "Archived"/);
  const card = readFileSync(new URL("../components/studio/novel-project-card.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(card, /fetch\(|useEffect|setInterval|setTimeout|notion\/|FieldLine|CoverBlock/);
});

test("Grid and List render identical collection and order for 1, 3, 20 and 100 projects", () => {
  const element = ({ children }) => React.createElement("div", null, children);
  const Button = ({ children, variant, size, ...props }) => { void variant; void size; return React.createElement("button", props, children); };
  const { LibraryScreen } = load("../components/studio/library-screen.tsx", {
    "react/jsx-runtime": jsx,
    "lucide-react": Object.fromEntries(["Grid2X2", "Library", "List", "Plus", "Search"].map(name => [name, () => null])),
    "@/components/studio/shared": { EmptyState: element, SectionHeader: element },
    "@/components/studio/novel-project-card": { NovelProjectCard },
    "@/components/ui/button": { Button },
    "@/components/ui/card": { Card: div, CardContent: div },
    "@/components/ui/input": { Input: props => React.createElement("input", props) },
    "@/components/ui/select": Object.fromEntries(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map(name => [name, element])),
    "@/lib/studio-domain": { genreFilters: [], statusFilters: [] },
    "@/lib/studio-library-navigation": { librarySortOptions: ["updated", "created", "title", "words"], libraryNarrativeStatuses: ["All statuses", "Writing"], librarySearchLimit: 160 }
  });
  function flatten(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(flatten)] : []; }
  for (const count of [1, 3, 20, 100]) {
    const novels = Array.from({ length: count }, (_, i) => ({ ...novel, id: `novel-${i}`, title: `${i} ${novel.title}` }));
    const original = JSON.stringify(novels);
    const calls = [];
    const selected = [];
    const shared = { novels, novelMetrics: {}, writingTargets: {}, query: "Sombra", status: "Writing", genre: "Fantasy", sort: "title", translate: x => x,
      onViewChange: view => calls.push(view), onQueryChange: () => {}, onStatusChange: () => {}, onGenreChange: () => {}, onSortChange: () => {}, onClearFilters: () => {}, onOpenDialog: () => {}, onSelectNovel: id => selected.push(id), onExportNovel: () => {} };
    for (const view of ["grid", "list"]) {
      const tree = LibraryScreen({ ...shared, view });
      const nodes = flatten(tree);
      const cards = nodes.filter(n => n.type === NovelProjectCard);
      assert.deepEqual(cards.map(c => c.props.novel.id), novels.map(n => n.id));
      assert.ok(cards.every(c => c.props.view === view));
      assert.equal(nodes.find(n => n.props["aria-label"] === `${view === "grid" ? "Grid" : "List"} view`).props["aria-pressed"], true);
      assert.ok(cards.every(c => c.props.onSelectNovel === shared.onSelectNovel));
      const html = renderToStaticMarkup(tree);
      assert.equal((html.match(/<h2 /g) ?? []).length, count);
      assert.equal((html.match(/<details /g) ?? []).length, count);
      assert.match(html, /role="menu"/);
      assert.match(html, /Export/);
    }
    const nodes = flatten(LibraryScreen({ ...shared, view: "grid" }));
    nodes.find(n => n.props["aria-label"] === "List view").props.onClick();
    assert.deepEqual(calls, ["list"]);
    assert.equal(JSON.stringify(novels), original);
  }
  assert.match(renderLongCard("list"), /md:grid-cols-/);
  assert.doesNotMatch(renderLongCard("list"), /Volumes/);
  for (const totalNovelCount of [0, 100]) {
    let cleared = 0;
    let created = 0;
    const nodes = flatten(LibraryScreen({ novels: [], novelMetrics: {}, writingTargets: {}, totalNovelCount, query: "missing", status: "All statuses", genre: "All genres", sort: "updated", view: "grid", translate: x => x, onClearFilters: () => cleared++, onOpenDialog: () => created++ }));
    assert.ok(nodes.some(node => node.props.title === (totalNovelCount ? "No novels match these filters" : "No novels yet")));
    const action = nodes.find(node => node.type === Button && node.props.className === "justify-self-center");
    action.props.onClick();
    assert.equal(cleared, totalNovelCount ? 1 : 0);
    assert.equal(created, totalNovelCount ? 0 : 1);
    assert.ok(nodes.some(node => node.props.role === "status" && node.props["aria-live"] === "polite"));
  }
  const archivedNodes = flatten(LibraryScreen({
    novels: [], totalNovelCount: 3, lifecycle: "archived", novelMetrics: {}, writingTargets: {},
    query: "", status: "All statuses", genre: "All genres", sort: "updated", view: "list", translate: x => x,
    onQueryChange: () => {}, onStatusChange: () => {}, onGenreChange: () => {}, onSortChange: () => {}, onViewChange: () => {}, onClearFilters: () => {}, onOpenDialog: () => {}
  }));
  assert.ok(archivedNodes.some(node => node.props.title === "No archived novels"));
});

test("Library marks only the persisted active novel and forwards the same Notion summary in grid and list", () => {
  const element = ({ children }) => React.createElement("div", null, children);
  const Button = ({ children, ...props }) => React.createElement("button", props, children);
  const flatten = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(flatten)] : [];
  const { LibraryScreen } = load("../components/studio/library-screen.tsx", {
    "react/jsx-runtime": jsx,
    "lucide-react": Object.fromEntries(["Grid2X2", "Library", "List", "Plus", "Search"].map(name => [name, () => null])),
    "@/components/studio/shared": { EmptyState: element, SectionHeader: element },
    "@/components/studio/novel-project-card": { NovelProjectCard },
    "@/components/ui/button": { Button },
    "@/components/ui/card": { Card: div, CardContent: div },
    "@/components/ui/input": { Input: props => React.createElement("input", props) },
    "@/components/ui/select": Object.fromEntries(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map(name => [name, element])),
    "@/lib/studio-domain": { genreFilters: [], statusFilters: [] },
    "@/lib/studio-library-navigation": { librarySortOptions: ["updated"], libraryNarrativeStatuses: ["All statuses"], librarySearchLimit: 160 }
  });
  const novels = ["novel-a", "novel-b"].map(id => ({ ...novel, id, title: id }));
  const shared = {
    novels, novelMetrics: {}, writingTargets: {}, activeNovelId: "novel-b",
    notionStatusByNovel: { "novel-a": { label: "Changes pending", lastSuccessfulSync: null }, "novel-b": { label: "Remote changes", lastSuccessfulSync: "2026-09-05T12:00:00.000Z" } },
    query: "", status: "All statuses", genre: "All genres", sort: "updated", translate: x => x,
    onQueryChange: () => {}, onStatusChange: () => {}, onGenreChange: () => {}, onSortChange: () => {}, onViewChange: () => {}, onClearFilters: () => {}, onOpenDialog: () => {}
  };
  for (const view of ["grid", "list"]) {
    const cards = flatten(LibraryScreen({ ...shared, view })).filter(node => node.type === NovelProjectCard);
    assert.deepEqual(cards.map(card => card.props.isCurrent), [false, true]);
    assert.deepEqual(cards.map(card => card.props.notionStatus), ["Changes pending", "Remote changes"]);
  }
});

test("Library view uses canonical Settings, survives serialization and ignores obsolete query view", () => {
  const data = load("../lib/studio-data.ts", { "@/lib/character-relationship": { relationshipSummary: x => x } });
  const settings = load("../lib/studio-settings.ts", {
    "@/lib/studio-data": data,
    "@/lib/studio-domain": { exportFormats: ["EPUB"], exportOptions: ["Include cover", "Include metadata"] },
    "@/lib/reader-preferences": { normalizeReaderFontSize: x => x, normalizeReaderWidth: x => x }
  });
  assert.equal(settings.parseStudioSettings(null).libraryView, "grid");
  assert.deepEqual(settings.validateStudioSettingsUpdate({ libraryView: "list" }), { libraryView: "list" });
  assert.equal(settings.validateStudioSettingsUpdate({ libraryView: "arbitrary" }), null);
  const saved = settings.applyStudioSettings(data.defaultPersistedStudioSettings, { libraryView: "list" });
  assert.equal(settings.parseStudioSettings(JSON.stringify(saved)).libraryView, "list");
  assert.equal(settings.parseStudioSettings('{"libraryView":"broken"}').libraryView, "grid");
  const navigation = load("../lib/studio-library-navigation.ts", { "@/lib/studio-domain": { statusFilters: ["All statuses", "Writing"], genreFilters: ["All genres", "Fantasy"] } });
  const parsed = navigation.parseLibraryNavigationState(new URLSearchParams("status=writing&genre=fantasy&sort=title&view=grid"));
  assert.deepEqual(parsed, { status: "Writing", genre: "Fantasy", sort: "title", lifecycle: "active" });
  assert.equal(navigation.serializeLibraryNavigationState(parsed).toString(), "status=writing&genre=fantasy&sort=title");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /view=\{studioSettings.libraryView\}/);
  assert.match(page, /updateStudioSetting\("libraryView", view\)/);
  assert.doesNotMatch(page, /updateLibraryNavigation\(\{ view/);
});
