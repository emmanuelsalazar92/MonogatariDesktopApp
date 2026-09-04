import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const detail = createJiti(import.meta.url)("../lib/note-detail.ts");
const note = { id: "note", novelId: "novel", title: "<script>Title</script>", content: "<script>private</script>\nFull content", quotedText: "<script>Akira opened the door</script>", pinned: false, workflowStatus: "open", archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-02", revision: 3, tags: ["Continuity"], links: ["Character", "Scene", "Place", "TimelineEvent", "Volume", "Chapter"].map(type => ({ type, id: type.toLowerCase(), title: `${type} name`, archived: false })) };
const props = { novelId: "novel", noteId: "note", version: 0, onClose() {}, onEdit() {}, onChanged() {}, returnFocusRef: { current: null } };
const source = read("components/studio/note-detail-dialog.tsx");

function load(react) {
  const element = tag => function Element({ children, ...props }) { return React.createElement(tag, props, children); };
  const modules = {
    react, "react/jsx-runtime": jsxRuntime, "@/lib/note-detail": detail,
    "next/link": { default: element("a") },
    "@/components/ui/button": { Button: ({ variant, ...props }) => React.createElement("button", { ...props, "data-variant": variant }) },
    "@/components/ui/dialog": { Dialog: ({ children }) => React.createElement("section", null, children), DialogContent: ({ children, className }) => React.createElement("article", { className, role: "dialog", "aria-modal": true }, children), DialogHeader: element("header"), DialogFooter: element("footer"), DialogTitle: element("h2"), DialogDescription: element("p") }
  };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText)(id => id === "next/link" ? modules[id].default : modules[id], exports);
  return exports.NoteDetailDialog;
}

test("Detail reader rejects foreign/malformed data; each active attachment uses its canonical route", () => {
  assert.equal(detail.readNoteDetail(note, "novel", "note"), note);
  for (const value of [null, { ...note, novelId: "foreign" }, { ...note, id: "other" }, { ...note, revision: -1 }, { ...note, links: [{ type: "Secret", id: "x", title: "x", archived: false }] }, { ...note, links: [{ ...note.links[0], id: "../x" }] }, { ...note, tags: [null] }]) assert.equal(detail.readNoteDetail(value, "novel", "note"), null);
  const expected = ["/novels/novel/characters/character", "/novels/novel/editor/scene", "/novels/novel/places/place", "/novels/novel/timeline/timelineevent", "/novels/novel/structure?kind=volume&target=volume", "/novels/novel/structure?kind=chapter&target=chapter"];
  assert.deepEqual(note.links.map(link => detail.noteAttachmentHref("novel", link)), expected);
  assert.equal(detail.noteAttachmentHref("novel", { ...note.links[0], archived: true }), null);
  assert.equal(detail.noteAttachmentHref("novel", { ...note.links[0], id: "../foreign" }), null);
});

test("Read-only detail renders escaped full content, metadata, semantic links and lifecycle controls", () => {
  let index = 0;
  const Component = load({ ...React, useState(initial) { const i = index++; return React.useState(i === 0 ? note : i === 1 ? false : initial); } });
  const html = renderToStaticMarkup(React.createElement(Component, props));
  for (const value of ["Note detail", "Full content", "Quoted Scene context", "Updated", "Tags", "Story attachments", "Edit", "Pin", "Resolve", "Archive", "Delete…", "Close", "relationship-dialog-footer"]) assert.ok(html.includes(value), value);
  assert.match(html, /&lt;script&gt;private/); assert.match(html, /&lt;script&gt;Akira opened/); assert.doesNotMatch(html, /<script>|<textarea|<input/);
  assert.equal((html.match(/href=/g) ?? []).length, 6);
  assert.match(source, /cache: "no-store"/); assert.match(source, /return \(\) => abort.abort\(\)/);
  assert.match(source, /returnFocusRef.current\?\.focus/); assert.match(source, /cancelRef.current\?\.focus/);
});

test("Informational detail has no Resolve/Reopen action; legacy and resolved notes retain workflow", () => {
  for (const workflowStatus of ["informational", "in_progress", "done"]) {
    let index = 0;
    const Component = load({ ...React, useState(initial) { const i = index++; return React.useState(i === 0 ? { ...note, workflowStatus } : i === 1 ? false : initial); } });
    const html = renderToStaticMarkup(React.createElement(Component, props));
    if (workflowStatus === "informational") { assert.match(html, /Informational/); assert.doesNotMatch(html, />Resolve<|>Reopen<|>Resolved</); }
    else assert.match(html, workflowStatus === "done" ? />Reopen</ : />Resolve</);
  }
});

function harness(extra = {}) {
  const state = []; let cursor = 0, tree;
  const Component = load({
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = i === 0 ? structuredClone(note) : i === 1 ? false : typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; }, useEffect() {}
  });
  const walk = node => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  const render = () => { cursor = 0; tree = Component({ ...props, ...extra }); };
  const find = predicate => { const found = walk(tree).find(predicate); assert.ok(found, "element found"); return found; };
  render(); return { render, find, button: text => find(node => node.props?.children === text && node.props.onClick), getNote: () => state[0] };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("Pin guards immediate double-submit, sends revision-only metadata and blocks Escape during save", async () => {
  const original = globalThis.fetch; let finish, changed = 0; const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, ...init }); await new Promise(resolve => { finish = resolve; }); return { ok: true, async json() { return { ...note, pinned: true, revision: 4 }; } }; };
  try {
    const h = harness({ onChanged() { changed++; } }); h.button("Pin").props.onClick(); h.button("Pin").props.onClick();
    h.render(); let prevented = false;
    h.find(node => Boolean(node.props?.onEscapeKeyDown)).props.onEscapeKeyDown({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
    assert.equal(h.button("Close").props.disabled, true); assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body), { revision: 3, pinned: true });
    finish(); await settle(); h.render(); assert.equal(changed, 1); assert.ok(h.button("Unpin"));
  } finally { globalThis.fetch = original; }
});

test("Archive/Restore update only lifecycle metadata and keep the full detail available", async () => {
  const original = globalThis.fetch; const requests = []; let current = structuredClone(note);
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); requests.push(body); current = { ...current, ...body, revision: current.revision + 1 }; return { ok: true, async json() { return current; } }; };
  try {
    const h = harness(); h.button("Archive").props.onClick(); await settle(); h.render();
    assert.equal(typeof requests[0].archivedAt, "string"); assert.deepEqual(Object.keys(requests[0]).sort(), ["archivedAt", "revision"]);
    assert.deepEqual(h.getNote().links, note.links); assert.equal(h.getNote().content, note.content);
    h.button("Restore").props.onClick(); await settle(); h.render(); assert.deepEqual(requests[1], { revision: 4, archivedAt: null }); assert.ok(h.button("Archive"));
  } finally { globalThis.fetch = original; }
});

test("Delete first shows confirmation; Cancel writes nothing; stale confirmation cannot auto-retry", async () => {
  const original = globalThis.fetch; let writes = 0;
  globalThis.fetch = async (_url, init) => { writes++; assert.equal(init.method, "DELETE"); assert.deepEqual(JSON.parse(init.body), { revision: 3, confirmed: true }); return { ok: false, status: 409 }; };
  try {
    const h = harness(); h.button("Delete…").props.onClick(); h.render(); assert.equal(writes, 0); assert.ok(h.button("Confirm delete note"));
    h.button("Cancel deletion").props.onClick(); h.render(); assert.equal(writes, 0);
    h.button("Delete…").props.onClick(); h.render(); h.button("Confirm delete note").props.onClick(); h.button("Confirm delete note").props.onClick(); await settle(); h.render();
    assert.equal(writes, 1); assert.equal(h.button("Delete…").props.disabled, true); assert.ok(h.button("Refresh note")); assert.equal(h.getNote().id, "note");
  } finally { globalThis.fetch = original; }
});

test("Confirmed successful Delete closes detail and refreshes catalog exactly once; Edit is explicit", async () => {
  const original = globalThis.fetch; let changed = 0, closed = 0, edited = 0;
  globalThis.fetch = async () => ({ ok: true });
  try {
    const h = harness({ onChanged() { changed++; }, onClose() { closed++; }, onEdit(value) { assert.equal(value.id, "note"); edited++; } });
    assert.equal(edited, 0); h.button("Edit").props.onClick(); assert.equal(edited, 1);
    h.button("Delete…").props.onClick(); h.render(); h.button("Confirm delete note").props.onClick(); await settle();
    assert.equal(changed, 1); assert.equal(closed, 1);
  } finally { globalThis.fetch = original; }
});
