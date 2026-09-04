import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";

const contract = createJiti(import.meta.url)("../lib/note-contract.ts");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("components/studio/note-form-dialog.tsx");
function load(react = React, draftOverrides = {}) {
  const element = tag => function Element({ children, ...props }) { return React.createElement(tag, props, children); };
  const modules = {
    react, "react/jsx-runtime": jsxRuntime, "@/lib/note-contract": contract,
    "@/lib/note-draft": createJiti(import.meta.url)("../lib/note-draft.ts"),
    "./use-note-draft": { useNoteDraft: () => ({ ready: true, dirty: false, candidates: [], conflict: false, persist: () => true, markAttempt() {}, markSaved: () => true, ...draftOverrides }) },
    "@/components/ui/input": { Input: element("input") }, "@/components/ui/textarea": { Textarea: element("textarea") },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/button": { Button: ({ variant, ...props }) => React.createElement("button", { ...props, "data-variant": variant }) },
    "@/components/ui/dialog": {
      Dialog: ({ children }) => React.createElement("section", null, children),
      DialogContent: ({ children, className }) => React.createElement("article", { role: "dialog", "aria-modal": true, className }, children),
      DialogHeader: element("header"), DialogFooter: element("footer"), DialogTitle: element("h2"), DialogDescription: element("p")
    }
  };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText)(id => { assert.ok(modules[id], id); return modules[id]; }, exports);
  return exports.NoteFormDialog;
}
const props = { novelId: "novel", options: contract.noteLinkTypes.map(type => ({ type, id: type, title: `${type} name`, novelId: "novel" })), onClose() {}, async onSaved() {} };
const note = { id: "note", novelId: "novel", title: "Existing", content: " private \n text ", quotedText: "", tags: ["a,b", "line\nbreak"], revision: 4, links: [{ type: "Place", id: "old", title: "Historical place", archived: true }] };

test("Add/Edit share bounded opaque dialog, collapsed attachments and safe existing values", () => {
  for (const initial of [null, { ...note, title: "<script>unsafe</script>" }]) {
    const html = renderToStaticMarkup(React.createElement(load(), { ...props, note: initial }));
    for (const text of ["relationship-dialog-header", "relationship-dialog-body", "relationship-dialog-footer", "Save Note", "Cancel", "Attach to story", "Title (required)", "Content", "Tags (optional)"]) assert.ok(html.includes(text), text);
    assert.doesNotMatch(html, /<details[^>]*\bopen|<script>/);
    assert.equal((html.match(/<select/g) ?? []).length, 1);
    if (initial) { assert.match(html, /Historical place/); assert.match(html, /&lt;script&gt;/); }
  }
  const css = read("app/globals.css"), dialog = read("components/ui/dialog.tsx");
  assert.match(css, /background-color: rgb\(var\(--popover\)\)/);
  assert.match(css, /max-height: calc\(100dvh - 1rem\)/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(dialog, /DialogPrimitive.Content/);
  assert.match(source, /<Dialog open modal/);
  assert.match(source, /titleRef.current\?\.focus/);
  assert.match(source, /invoker.focus\(\{ preventScroll: true \}\)/);
});

// Exercise component handlers with persistent hook state. Browser focus/layout is a separate check.
function harness(extra = {}, draftOverrides = {}) {
  const cells = []; let cursor = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useId() { return "form"; }, useEffect() {}
  };
  const Component = load(hooks, draftOverrides); let tree;
  const walk = node => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  const render = () => { cursor = 0; tree = Component({ ...props, ...extra }); return tree; };
  const find = predicate => { const node = walk(tree).find(predicate); assert.ok(node, "element found"); return node; };
  render();
  return { render, find, field: name => find(node => node.props?.id === `form-${name}`), submit: () => find(node => node.type === "form").props.onSubmit({ preventDefault() {} }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("Workflow is opt-in, edit preserves Resolved, and tracking can be removed", async () => {
  const original = globalThis.fetch, writes = [];
  globalThis.fetch = async (url, request) => { writes.push(JSON.parse(request.body)); return { ok: true }; };
  try {
    const add = harness(); assert.equal(add.field("workflow").props.checked, false);
    add.field("title").props.onChange({ target: { value: "Question" } });
    add.field("workflow").props.onChange({ target: { checked: true } }); add.render(); add.submit(); await settle();
    assert.equal(writes[0].workflowStatus, "open");
    const edit = harness({ note: { ...note, workflowStatus: "done" } });
    assert.equal(edit.field("workflow").props.checked, true); edit.submit(); await settle();
    assert.equal(writes[1].workflowStatus, "done");
    const untrack = harness({ note: { ...note, workflowStatus: "done" } });
    untrack.field("workflow").props.onChange({ target: { checked: false } }); untrack.render(); untrack.submit(); await settle();
    assert.equal(writes[2].workflowStatus, "informational");
  } finally { globalThis.fetch = original; }
});

test("Recovery and revision conflict block Save; stored text renders safely", async () => {
  const original = globalThis.fetch; let writes = 0;
  globalThis.fetch = async () => { writes++; return { ok: true }; };
  try {
    const candidate = { noteId: "note", baseRevision: 1, savedAt: 100, attemptedSave: true, fields: { title: "<script>draft</script>" } };
    for (const state of [{ candidates: [candidate] }, { conflict: true }]) {
      const h = harness({ note }, state); h.submit(); await settle();
      assert.equal(h.find(node => node.props?.type === "submit").props.disabled, true);
      assert.equal(writes, 0);
    }
    const html = renderToStaticMarkup(React.createElement(load(React, { candidates: [candidate] }), { ...props, note }));
    assert.match(html, /Recover draft/); assert.match(html, /Discard stored draft/);
    assert.match(html, /different revision/); assert.match(html, /may already have succeeded/);
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  } finally { globalThis.fetch = original; }
});

test("Close flushes draft and stays open on local failure; cleanup retry never repeats API", async () => {
  let closed = 0, writes = 0, clean = false;
  const blocked = harness({ onClose() { closed++; } }, { persist: () => false });
  blocked.find(node => node.props?.children === "Cancel").props.onClick(); assert.equal(closed, 0);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { writes++; return { ok: true }; };
  try {
    const h = harness({ note, onClose() { closed++; } }, { markSaved: () => clean });
    h.submit(); await settle(); h.render(); assert.equal(writes, 1); assert.equal(closed, 0);
    clean = true; h.submit(); await settle(); assert.equal(writes, 1); assert.equal(closed, 1);
  } finally { globalThis.fetch = original; }
});

test("Blank title reports adjacent error, retains content and sends no mutation", async () => {
  const oldDocument = globalThis.document;
  globalThis.document = { activeElement: null, getElementById: () => ({ focus() {} }) };
  try {
    const h = harness(); h.field("title").props.onChange({ target: { value: "   " } }); h.field("content").props.onChange({ target: { value: "draft" } }); h.render(); h.submit(); await settle(); h.render();
    assert.equal(h.field("title").props["aria-invalid"], true);
    assert.equal(h.field("content").props.value, "draft");
    assert.ok(h.find(node => node.props?.id === "form-title-error"));
  } finally { globalThis.document = oldDocument; }
});

test("Multiple typed attachments and pending tag save through canonical API; immediate double submit is blocked", async () => {
  const original = globalThis.fetch; const requests = []; let finish, closed = 0;
  globalThis.fetch = async (...args) => { requests.push(args); await new Promise(resolve => { finish = resolve; }); return { ok: true }; };
  try {
    const h = harness({ onClose() { closed++; } });
    h.field("title").props.onChange({ target: { value: " New " } }); h.field("tags").props.onChange({ target: { value: "Tag" } });
    for (const type of contract.noteLinkTypes) {
      h.render(); h.field("links").props.onChange({ target: { value: type } }); h.render();
      h.find(node => node.type === "input" && node.props.type === "checkbox" && !node.props.id).props.onChange({ target: { checked: true } });
    }
    h.render(); h.submit(); h.submit(); await settle();
    assert.equal(requests.length, 1); h.render(); assert.equal(h.find(node => node.type === "form").props["aria-busy"], true);
    const [url, request] = requests[0], body = JSON.parse(request.body);
    assert.equal(url, "/api/notes?novelId=novel"); assert.equal(request.method, "POST"); assert.equal(body.title, "New");
    assert.equal(body.links.length, 6); assert.deepEqual(body.tags, ["Tag"]); assert.equal(body.workflowStatus, "informational");
    finish(); await settle(); assert.equal(closed, 1);
  } finally { globalThis.fetch = original; }
});

test("Edit preserves historical attachments, content and tags; stale rejection keeps draft", async () => {
  const original = globalThis.fetch; let request;
  globalThis.fetch = async (url, input) => { request = { url, ...input }; return { ok: false, status: 409 }; };
  try {
    const h = harness({ note }); h.submit(); await settle(); h.render();
    assert.equal(request.method, "PATCH"); assert.match(request.url, /\/notes\/note\?/);
    const body = JSON.parse(request.body); assert.equal(body.revision, 4); assert.equal(body.content, note.content);
    assert.deepEqual(body.tags, note.tags); assert.deepEqual(body.links, [{ type: "Place", id: "old" }]);
    assert.equal(h.field("title").props.value, "Existing"); assert.ok(h.find(node => node.props?.id === "form-links-error"));
  } finally { globalThis.fetch = original; }
});

test("Refresh retry never repeats successful mutation; Cancel does not write", async () => {
  const original = globalThis.fetch; let writes = 0, refreshes = 0, closed = 0;
  globalThis.fetch = async () => { writes++; return { ok: true }; };
  try {
    const h = harness({ note, onClose() { closed++; }, async onSaved() { if (++refreshes === 1) throw new Error("Refresh failed"); } });
    h.submit(); await settle(); h.render(); assert.ok(h.find(node => node.props?.children === "Retry cleanup / refresh"));
    h.submit(); await settle(); assert.equal(writes, 1); assert.equal(refreshes, 2); assert.equal(closed, 1);
    const cancel = harness({ onClose() { closed++; } }); cancel.find(node => node.props?.children === "Cancel").props.onClick();
    assert.equal(writes, 1); assert.equal(closed, 2);
  } finally { globalThis.fetch = original; }
});

test("Options from another Novel never enter selector; background snapshots do not reset draft", () => {
  const h = harness({ options: [...props.options, { type: "Character", id: "foreign", title: "FOREIGN", novelId: "other" }] });
  h.field("title").props.onChange({ target: { value: "draft" } }); h.render(); assert.equal(h.field("title").props.value, "draft");
  const html = renderToStaticMarkup(React.createElement(load(), { ...props, options: [{ type: "Character", id: "foreign", title: "FOREIGN", novelId: "other" }] }));
  assert.doesNotMatch(html, /FOREIGN/);
});

test("Contextual capture preselects Scene and selected content, permits extra targets, Cancel never writes", async () => {
  const original = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, input) => { requests.push({ url, ...input }); return { ok: true }; };
  try {
    const capture = { novelId: "novel", target: { novelId: "novel", type: "Scene", id: "Scene", title: "Current scene" }, title: "Reina desconfía", content: "", quotedText: "<script>Reina desconfía de la torre</script>" };
    let closed = 0;
    const cancelled = harness({ capture, onClose() { closed++; } });
    assert.equal(cancelled.field("content").props.value, capture.content);
    cancelled.find(node => node.props?.children === "Cancel").props.onClick(); assert.equal(requests.length, 0); assert.equal(closed, 1);
    const h = harness({ capture });
    h.find(node => node.type === "input" && node.props.type === "checkbox" && !node.props.id).props.onChange({ target: { checked: true } });
    h.render(); h.submit(); await settle();
    const body = JSON.parse(requests[0].body);
    assert.deepEqual(body.links, [{ type: "Scene", id: "Scene" }, { type: "Character", id: "Character" }]);
    assert.equal(body.content, ""); assert.equal(body.quotedText, capture.quotedText); assert.equal(body.title, capture.title);
    assert.deepEqual(Object.keys(body).sort(), ["content", "links", "quotedText", "tags", "title", "workflowStatus"]);
    assert.equal(requests.length, 1); assert.equal(requests[0].url, "/api/notes?novelId=novel");
    const html = renderToStaticMarkup(React.createElement(load(), { ...props, capture }));
    assert.match(html, /From Scene/); assert.match(html, /Quoted Scene context/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  } finally { globalThis.fetch = original; }
});
