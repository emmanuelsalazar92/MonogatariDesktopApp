import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import createJiti from "jiti";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const matcher = createJiti(import.meta.url)("../lib/character-highlight.ts");

test("Selection actions preserve content and scroll, prevent duplicate creation and reuse canonical Note context", async () => {
  const requests = [], captures = [], notifications = [], ranges = [];
  const previous = { fetch: globalThis.fetch, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  const hooks = { ...React, useRef: value => ({ current: value }), useState: value => [value, () => {}],
    useCallback: fn => fn, useEffect: () => {}, useLayoutEffect: () => {}, useContext: () => (...args) => captures.push(args) };
  const modules = { react: hooks, "react/jsx-runtime": jsxRuntime, "react-dom": { createPortal: child => child },
    "lucide-react": { UserRound: "i", MapPin: "i", StickyNote: "i", X: "i" },
    "@/components/ui/button": { Button: "button" }, "./note-capture": { NoteCaptureContext: {} } };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read("components/studio/selection-capture-menu.tsx"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
  globalThis.document = { body: {} };
  globalThis.requestAnimationFrame = callback => { callback(); return 1; };
  globalThis.fetch = async (url, init) => { requests.push([url, JSON.parse(init.body)]); return { ok: true }; };
  try {
    for (const [kind, text] of [["Character", "Sayuri"], ["Place", "Santuario Seiryu"], ["Note", "Una frase del manuscrito"]]) {
      const input = { value: text, dataset: { sceneId: "scene-a" }, scrollTop: 150, scrollLeft: 0,
        focus(options) { assert.equal(options.preventScroll, true); },
        setSelectionRange(start, end) { ranges.push([start, end]); this.scrollTop = 0; } };
      const target = { novelId: "novel-a", type: "Scene", id: "scene-a", title: "Scene" };
      const props = { target, manuscriptRef: { current: input }, selection: { sceneId: "scene-a", start: 0, end: text.length },
        onRefresh() {}, onNotify: message => notifications.push(message) };
      const tree = exports.SelectionCaptureMenu(props);
      const button = React.Children.toArray(tree.props.children).find(child =>
        React.Children.toArray(child.props?.children).some(value => typeof value === "string" && value.trim() === kind));
      button.props.onClick();
      if (kind !== "Note") button.props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(input.value, text);
      assert.equal(input.scrollTop, 150);
      if (kind === "Note") assert.deepEqual(captures.at(-1), [target, text]);
      else assert.deepEqual(requests.at(-1), ["/api/quick-capture", { novelId: "novel-a", sceneId: "scene-a", kind, name: text }]);
      assert.equal(exports.SelectionCaptureMenu({ ...props, selection: { ...props.selection, sceneId: "other" } }), null);
      assert.equal(exports.SelectionCaptureMenu({ ...props, selection: { ...props.selection, end: 0 } }), null);
    }
    assert.equal(requests.length, 2);
    assert.deepEqual(notifications, ["Character 'Sayuri' created", "Place 'Santuario Seiryu' created"]);
    assert.deepEqual(ranges, [[6, 6], [16, 16]]);
  } finally { Object.assign(globalThis, previous); }
});

test("Character matcher is case-insensitive, whole-word, longest-first and ambiguity-safe", () => {
  const akira = { id: "akira", name: "Akira", aliases: ["Aki"] }, tanaka = { id: "tanaka", name: "Akira Tanaka", aliases: [] }, reina = { id: "reina", name: "Reina", aliases: ["La Reina"] };
  const matches = matcher.matchCharacterHighlights("AKIRA TANAKA habló con Reina; Akira y AkiraX no.", [akira, tanaka, reina]);
  assert.deepEqual(matches.map(item => [item.text, item.character.id]), [["AKIRA TANAKA", "tanaka"], ["Reina", "reina"], ["Akira", "akira"]]);
  assert.deepEqual(matcher.matchCharacterHighlights("Akira llegó", [akira, { id: "other", name: "Other", aliases: ["Akira"] }]), []);
  assert.deepEqual(matcher.matchCharacterHighlights("Aki llegó al río", [akira]).map(item => item.character.id), ["akira"]);
});

test("Quick capture endpoint validates Scene ownership and reuses canonical local creators", async () => {
  const calls = [], modules = {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } }) } },
    "@/lib/character-metadata": { validateCharacterMetadata: value => typeof value.name === "string" && value.name.trim() && value.name.length <= 120 ? { ok: true, data: { name: value.name.trim() } } : { ok: false, fieldErrors: { name: "invalid" } } },
    "@/lib/place-metadata": { validatePlaceMetadata: value => typeof value.name === "string" && value.name.trim() && value.name.length <= 120 ? { ok: true, data: { name: value.name.trim() } } : { ok: false, fieldErrors: { name: "invalid" } } },
    "@/lib/db/studio": { sceneBelongsToNovel: async (scene, novel) => scene === "scene-a" && novel === "novel-a", createCharacter: async value => { calls.push(["Character", value]); return { id: "character" }; } },
    "@/lib/db/places": { createPlace: async (...value) => { calls.push(["Place", ...value]); return { id: "place" }; } },
    "@/lib/request-security": { isTrustedLanMutationRequest: request => request.headers.get("origin") !== "https://evil.test" },
    "@/lib/studio-routes": { isValidNovelRouteId: value => typeof value === "string" && /^[\w-]+$/.test(value) }
  };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read("app/api/quick-capture/route.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => modules[id], exports);
  const request = (body, origin = "http://localhost") => new Request("http://localhost/api/quick-capture", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await exports.POST(request({ novelId: "novel-a", sceneId: "scene-a", kind: "Character", name: "  Sayuri  " }))).status, 201);
  assert.equal(calls[0][1].markExternalDirty, false);
  assert.equal((await exports.POST(request({ novelId: "novel-a", sceneId: "scene-a", kind: "Place", name: "Santuario Seiryu" }))).status, 201);
  assert.equal(calls.length, 2);
  for (const body of [{ novelId: "novel-a", sceneId: "foreign", kind: "Character", name: "No" }, { novelId: "novel-a", sceneId: "scene-a", kind: "Character", name: " ", secret: "x" }]) assert.notEqual((await exports.POST(request(body))).status, 201);
  assert.equal(calls.length, 2);
  assert.equal((await exports.POST(request({ novelId: "novel-a", sceneId: "scene-a", kind: "Character", name: "No" }, "https://evil.test"))).status, 403);
});

test("Selection menu is floating, viewport-safe, dismissible and keyboard reachable without mutating manuscript", () => {
  const menu = read("components/studio/selection-capture-menu.tsx"), preview = read("components/studio/character-highlight-preview.tsx"), page = read("app/page.tsx"), route = read("app/api/quick-capture/route.ts"), css = read("app/globals.css");
  for (const action of ["Character", "Place", "Note"]) assert.match(menu, new RegExp(`> ${action}|\"${action}\"`));
  assert.match(menu, /createPortal\(/);
  assert.match(menu, /role="toolbar"/);
  assert.match(menu, /getTextareaSelectionRect/);
  assert.match(menu, /visualViewport/);
  assert.match(menu, /editorHasRoom/);
  assert.match(menu, /placement = .*\? "above" : "below"/);
  assert.match(menu, /addEventListener\("scroll", reposition, true\)/);
  assert.match(menu, /addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /event\.key === "Tab"/);
  assert.match(menu, /focus\(\{ preventScroll: true \}\)/);
  assert.match(menu, /setSelectionRange\(caret, preserveSelection \? selection\.end : caret\)/);
  assert.doesNotMatch(menu, /\.value\s*=/);
  assert.match(page, /className="manuscript-editor/);
  assert.match(css, /\.manuscript-editor::selection\s*\{[^}]*--selection-background[^}]*--selection-text/s);
  assert.match(preview, /localStorage\.setItem\(preferenceKey/); assert.match(preview, /aria-pressed={enabled}/); assert.match(preview, /event\.key === "Escape"/); assert.match(preview, /Open full profile/);
  assert.match(preview, /bg-primary-subtle/);
  assert.doesNotMatch(preview, /secret|notes|Place|Location/); assert.match(page, /character\.status === "Active" && !character\.archivedAt/);
  assert.doesNotMatch([menu, preview, route].join("\n"), /notion|openai|selectionStart:\s|selectionEnd:\s/i);
  assert.match(route, /sceneBelongsToNovel\(sceneId, novelId\)/); assert.match(route, /markExternalDirty: false/);
});
