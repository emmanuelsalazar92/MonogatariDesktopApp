import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const stub = () => null;
const modules = {
  "react/jsx-runtime": jsx,
  "lucide-react": { BookOpen: stub, ChevronsRight: stub, Columns3: stub, Menu: stub },
  "@/components/ui/select": Object.fromEntries(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map(name => [name, function Component() { return null; }])),
  "@/components/ui/separator": { Separator: stub },
  "@/components/studio/shared": { ToolbarIconButton: stub }
};
const exports = {};
const source = readFileSync(new URL("../components/studio/top-bar.tsx", import.meta.url), "utf8");
new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
function flatten(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(flatten)] : [];
}

test("Header keeps long novel titles inside its labelled selector and delegates selection unchanged", () => {
  const calls = [];
  const title = "Sombra Bajo la Lluvia — " + "UnbrokenLongTitle".repeat(40);
  const nodes = flatten(exports.TopBar({ pageLabel: "Dashboard", sidebarState: "compact", mobileNavigationOpen: false,
    novels: [{ id: "novel-one", title }], activeNovelId: "novel-one",
    copy: { openNavigation: "Open navigation", toggleSidebar: "Toggle sidebar", currentNovel: "Current Novel" },
    onOpenMobileNav: stub, onCycleSidebar: stub, onActiveNovelChange: id => calls.push(id) }));
  assert.deepEqual(calls, []);
  assert.equal(nodes.find(node => node.type === "h2").props.children, "Dashboard");
  const select = modules["@/components/ui/select"];
  assert.equal(nodes.filter(node => node.props.children === title).length, 1);
  assert.equal(nodes.find(node => node.type === select.SelectItem).props.children, title);
  const trigger = nodes.find(node => node.type === select.SelectTrigger);
  assert.equal(trigger.props["aria-label"], "Current Novel");
  assert.match(trigger.props.className, /min-w-0.*basis-full.*\[&>span\]:truncate/);
  const content = nodes.find(node => node.type === select.SelectContent);
  assert.match(content.props.className, /max-w-\[calc\(100vw-2rem\)\]/);
  const item = nodes.find(node => node.type === select.SelectItem);
  assert.match(item.props.className, /\[overflow-wrap:anywhere\]/);
  const root = nodes.find(node => node.type === select.Select);
  assert.equal(root.props.value, "novel-one");
  root.props.onValueChange("novel-two");
  assert.deepEqual(calls, ["novel-two"]);
});

test("Novel-scoped headers keep their page label without rendering a redundant selector", () => {
  const nodes = flatten(exports.TopBar({ pageLabel: "Current Novel", sidebarState: "compact", mobileNavigationOpen: false,
    novels: [{ id: "novel-one", title: "La Academia del Eco Azul" }], activeNovelId: "novel-one",
    copy: { openNavigation: "Open navigation", toggleSidebar: "Toggle sidebar", currentNovel: "Current Novel" },
    showNovelSelector: false,
    onOpenMobileNav: stub, onCycleSidebar: stub, onActiveNovelChange: stub }));
  const select = modules["@/components/ui/select"];
  assert.equal(nodes.find(node => node.type === "h2").props.children, "Current Novel");
  assert.equal(nodes.some(node => node.type === select.Select), false);
  assert.equal(nodes.some(node => node.type === select.SelectTrigger), false);
});
