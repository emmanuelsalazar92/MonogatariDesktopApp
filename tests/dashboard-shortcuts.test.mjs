import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const element = tag => function Element({ children, ...props }) { return React.createElement(tag, props, children); };
const statusExports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../lib/notion-status.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(statusExports);
const modules = {
  "@/lib/notion-status": statusExports,
  "react/jsx-runtime": jsx,
  "next/link": { default: ({ prefetch, ...props }) => { void prefetch; return React.createElement("a", props); } },
  "lucide-react": Object.fromEntries(["BadgeCheck", "BookOpen", "Boxes", "Download", "FileText", "Library", "PenLine"].map(name => [name, () => null])),
  "@/components/ui/button": { Button: ({ variant, ...props }) => { void variant; return React.createElement("button", props); } },
  "@/components/ui/badge": { Badge: ({ variant, ...props }) => { void variant; return React.createElement("span", props); } },
  "@/components/ui/card": Object.fromEntries(["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"].map(name => [name, element("div")])),
  "@/lib/studio-routes": { routeForPage: (page, id) => page === "overview" ? "/novels/" + id : "/" + page },
  "@/lib/studio-data": {
    formatNumber: String, getCurrentNovel: data => data.novels[0] ?? { id: "", title: "", wordCount: 0 },
    getActiveChapter: () => ({ title: "Chapter", status: "Writing", wordCount: 50 }),
    getActiveScene: () => ({ title: "Scene", summary: "", locationId: "" }), placeName: () => ""
  },
  "@/lib/writing-metrics": { estimateReadingMinutes: () => 1, getDailyWritingMetrics: () => ({ wordsToday: 0, dailyGoal: 1000, progressPercent: 0, scenesTouched: 0, estimatedWritingMinutes: 0 }) },
  "@/components/studio/shared": {
    CoverBlock: () => React.createElement("div", { "data-cover": true }),
    FieldLine: () => null, MetricCard: () => null, ProgressBar: () => null,
    StatusBadge: ({ status }) => React.createElement("span", null, status)
  }
};
const source = readFileSync(new URL("../components/studio/dashboard-screen.tsx", import.meta.url), "utf8");
const exports = {};
new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
function flatten(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(flatten)] : [];
}
function setup(novels, status = {}) {
  const calls = [];
  const tree = exports.DashboardScreen({ data: { novels, chapters: [], scenes: [], writingActivities: [] },
    translate: text => text, dailyWordGoal: "1000",
    onSelectPage: page => calls.push(["navigate", page]), onOpenNovel: id => calls.push(["novel", id]),
    onCreateNovel: () => calls.push(["create"]), ...status });
  return { tree, calls, nodes: flatten(tree) };
}
const novels = Array.from({ length: 4 }, (_, i) => ({ id: "novel-" + i, title: i ? "Novel " + i : "LongTitle".repeat(30),
  status: "Writing", synopsis: "Private synopsis should not appear in recent rows", wordCount: 1234, updatedAt: "2026-09-04" }));

test("Recent novels render three full-row links with metadata, no covers, nested controls or render mutations", () => {
  const { nodes, calls, tree } = setup(novels);
  const links = nodes.filter(node => node.type === modules["next/link"].default);
  assert.equal(links.length, 3);
  links.forEach((link, i) => {
    assert.equal(link.props.href, "/novels/novel-" + i);
    assert.equal(link.props.prefetch, false);
    const html = renderToStaticMarkup(link);
    for (const value of [novels[i].title, "Writing", "1234", "2026-09-04"]) assert.ok(html.includes(value));
    assert.doesNotMatch(html, /<button|data-cover|Private synopsis/);
  });
  renderToStaticMarkup(tree);
  assert.deepEqual(calls, []);
});

test("Quick Actions creates through the shared callback and only delegates Export navigation", () => {
  const { nodes, calls } = setup(novels);
  const quick = nodes.find(node => node.props.className === "flex min-w-0 flex-wrap gap-2.5");
  const actions = flatten(quick).filter(node => node.type === modules["@/components/ui/button"].Button);
  assert.equal(actions.length, 2);
  actions[0].props.onClick();
  actions[1].props.onClick();
  assert.deepEqual(calls, [["create"], ["navigate", "export"]]);
  assert.doesNotMatch(renderToStaticMarkup(quick), /Continue writing|Open reader|Sync|Library/);
});

test("No current novel keeps New Novel available and omits unavailable Export and Sync", () => {
  const { nodes } = setup([]);
  const quick = nodes.find(node => node.props.className === "flex min-w-0 flex-wrap gap-2.5");
  const html = renderToStaticMarkup(quick);
  assert.match(html, /New novel/);
  assert.doesNotMatch(html, /Export|Sync|disabled/);
});

test("Dashboard has no infrastructure card or reserved wrapper in populated and empty states", () => {
  for (const fixture of [novels, []]) {
    const { tree, nodes, calls } = setup(fixture);
    const html = renderToStaticMarkup(tree);
    assert.doesNotMatch(html, /Local server status|Accessible inside the home network|Running on local network|Local URL|IP URL|localhost|https?:\/\//i);
    const row = nodes.find(node => node.props.className === "grid min-w-0 items-start gap-4 lg:grid-cols-2");
    const cards = React.Children.toArray(row.props.children);
    assert.equal(cards.length, 2);
    assert.ok(cards.every(node => node.type === modules["@/components/ui/card"].Card));
    assert.match(renderToStaticMarkup(cards[0]), /Recent novels/);
    assert.match(renderToStaticMarkup(cards[1]), /Quick actions/);
    assert.deepEqual(calls, []);
  }
});

test("Notion indicator is canonical, novel-scoped, conservative and read-only", () => {
  const base = { novelId: novels[0].id, configured: true, mapped: true, isDirty: false, revision: 2, lastNotionSync: "2026-09-05T12:00:00.000Z" };
  for (const [state, automatic, manual, expected] of [
    [base, "idle", "idle", "Synced"],
    [{ ...base, isDirty: true }, "synced", "success", "Changes pending"],
    [base, "remote-changes", "success", "Remote changes"],
    [base, "syncing", "idle", "Syncing"],
    [base, "idle", "publishing", "Syncing"],
    [base, "error", "idle", "Sync error"],
    [{ ...base, configured: false }, "synced", "success", null],
    [{ ...base, mapped: false }, "synced", "success", null],
    [{ ...base, novelId: "foreign" }, "syncing", "idle", null],
    [{ ...base, lastNotionSync: null }, "synced", "success", null]
  ]) {
    const { tree, calls } = setup(novels, { notionSyncState: state, notionAutosyncStatus: automatic, notionPublishState: manual });
    const html = renderToStaticMarkup(tree);
    assert.equal(html.includes('role="status"'), expected !== null);
    if (expected) assert.ok(html.includes("Notion: " + expected));
    if (expected === "Remote changes") assert.ok(!html.includes("Notion: Synced"));
    assert.deepEqual(calls, []);
  }
  assert.doesNotMatch(source, /fetch\(|useEffect|setInterval|setTimeout|\.token|pageId|lastKnownContent/);
});

test("Dashboard consumes existing novel-scoped sync state; Settings diagnostics expose only browser origin", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../components/studio/settings-screen.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/studio/route.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  assert.match(page, /notionSyncState=\{currentNotionSyncState\}/);
  assert.match(page, /notionPublishStates\[currentNovel.id\]/);
  assert.match(page, /notionAutosyncStatuses\[currentNovel.id\]/);
  assert.match(api, /isNotionConfigured\(\)/);
  assert.doesNotMatch(api, /fetch\(|\/sync|\/pull|\/publish/);
  assert.match(db, /notionMapping\.findMany\(\{ where: \{ entityType: "novel", \.\.\.\(scopedNovelId/);
  assert.match(settings, /setAccessOrigin\(window.location.origin\)/);
  assert.doesNotMatch(settings, /window.location.(href|pathname|search)|http:\/\/novel.local|192\.168\./);
  assert.match(settings, /<details[\s\S]*Connection diagnostics[\s\S]*<\/details>/);
});
