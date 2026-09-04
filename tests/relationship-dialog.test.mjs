import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";

const require = createRequire(import.meta.url);
const { relationshipDefinitions } = createJiti(import.meta.url)("../lib/character-relationship.ts");
const { relationshipSinceOptions } = createJiti(import.meta.url)("../lib/relationship-since.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/page.tsx");
const source = page.slice(page.indexOf("function PrototypeDialog("));
const css = read("app/globals.css");
const rule = (selector) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

test("Relationship modal uses opaque theme surface and one bounded scrollport", () => {
  const surface = rule(".relationship-dialog");
  assert.match(surface, /background-color: rgb\(var\(--popover\)\)/);
  assert.match(surface, /max-height: calc\(100dvh - 1rem\)/);
  assert.match(surface, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(surface, /overflow: hidden/);
  assert.doesNotMatch(surface, /opacity:|overflow-y: auto/);
  assert.match(rule(".relationship-dialog-body"), /min-height: 0/);
  assert.match(rule(".relationship-dialog-body"), /overflow-y: auto/);
  assert.match(rule(".relationship-dialog-body"), /overscroll-behavior: contain/);
  for (const area of ["header", "footer"]) assert.doesNotMatch(rule(`.relationship-dialog-${area}`), /overflow.*auto/);
  assert.match(rule(".relationship-dialog-header"), /padding: 1rem 3.5rem/, "reserve space for Close");
  const shared = read("components/ui/dialog.tsx");
  assert.match(shared, /DialogPrimitive.Overlay/);
  assert.match(shared, /DialogPrimitive.Content/);
  assert.match(shared, /inset-0 z-50/);
  assert.match(shared, /z-\[51\]/);
});

test("Relationship modal retains focus, guarded dismissal and draft across refresh", () => {
  assert.match(source, /<Dialog open=\{Boolean\(dialog\)\} modal/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /relationshipFirstField.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /relationshipBody.current.scrollTop = 0/);
  assert.match(source, /relationshipInvoker.current.isConnected/);
  assert.match(source, /relationshipInvoker.current.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /onEscapeKeyDown=.*saving\) event.preventDefault\(\)/);
  assert.match(source, /onInteractOutside=.*saving\) event.preventDefault\(\)/);
  assert.match(source, /closeDisabled=\{dialog === "relationship" && saving\}/);
  assert.match(source, /if \(dialog === "relationship" && previousDialog.current === dialog\) return/);
  assert.match(source, /if \(saving\) return/);
  assert.match(source, /await onCreateRelationship\(/, "preserves server-backed save handler");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("Relationship header/body/footer render as siblings with labelled fields and persistent actions", () => {
  const element = (tag) => function TestElement({ children, className, ...props }) {
    return React.createElement(tag, { className, id: props.id, htmlFor: props.htmlFor, disabled: props.disabled,
      ...(props["aria-modal"] ? { "aria-modal": props["aria-modal"] } : {}) }, children);
  };
  const dependencies = {
    React, require, exports: {}, useStudioData: () => ({ characters: [{ id: "a", name: "<script>unsafe</script>" }], volumes: [], chapters: [], scenes: [], locations: [] }),
    getCurrentNovel: () => ({ id: "n", title: "Novel" }), relationshipDefinitions, relationshipSinceOptions,
    Dialog: element("section"), DialogContent: element("article"), DialogHeader: element("header"), DialogTitle: element("h2"), DialogDescription: element("p"), DialogFooter: element("footer"),
    Select: element("div"), SelectTrigger: element("button"), SelectValue: () => null, SelectContent: element("div"), SelectItem: element("span"),
    Label: element("label"), Input: element("input"), Textarea: element("textarea"), Switch: element("button"),
    Button: ({ children, ...props }) => React.createElement("button", props, children)
  };
  const fieldExports = {};
  const fieldModules = {
    "react/jsx-runtime": require("react/jsx-runtime"), react: React,
    "@/lib/character-relationship": { relationshipDefinitions },
    ...Object.fromEntries(["label", "input", "textarea", "switch"].map((name) => [`@/components/ui/${name}`, { [name === "textarea" ? "Textarea" : name[0].toUpperCase() + name.slice(1)]: dependencies[name === "textarea" ? "Textarea" : name[0].toUpperCase() + name.slice(1)] }])),
    "@/components/ui/select": dependencies
  };
  new Function("require", "exports", ts.transpileModule(read("components/studio/relationship-fields.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((id) => fieldModules[id], fieldExports);
  dependencies.RelationshipFields = fieldExports.RelationshipFields;
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const Component = new Function(...Object.keys(dependencies), `${compiled}; return PrototypeDialog;`)(...Object.values(dependencies));
  const props = { dialog: "relationship", exportFilename: "", onClose: () => {} };
  const html = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(html, /<article class="relationship-dialog" aria-modal="true"><header class="relationship-dialog-header">/);
  assert.match(html, /<h2>Add relationship<\/h2>/);
  assert.match(html, /<\/header><div class="relationship-dialog-body">/);
  assert.match(html, /<\/div><footer class="relationship-dialog-footer">/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Save Relationship<\/button>/);
  for (const field of ["from", "to", "type", "status", "since", "description", "notes", "spoiler"]) {
    assert.match(html, new RegExp(`for="relationship-${field}"`));
    assert.match(html, new RegExp(`id="relationship-${field}"`));
  }
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const other = renderToStaticMarkup(React.createElement(Component, { ...props, dialog: "note" }));
  assert.doesNotMatch(other, /class="relationship-dialog/);
  const selectedDependencies = { ...dependencies, React: { ...React, useState(initial) {
    return React.useState(initial && typeof initial === "object" && "relationshipType" in initial ? { ...initial, relationshipType: "mentor_of" } : initial);
  } } };
  const SelectedComponent = new Function(...Object.keys(selectedDependencies), `${compiled}; return PrototypeDialog;`)(...Object.values(selectedDependencies));
  const selected = renderToStaticMarkup(React.createElement(SelectedComponent, props));
  assert.match(selected, /Category: Social/);
  assert.match(selected, /Direction: Directional/);
  assert.match(selected, /From → To: Mentor of/);
  assert.match(selected, /To → From: Student of/);
  assert.doesNotMatch(selected, /<(input|select)[^>]*(category|direction|inverse)/i);
});
