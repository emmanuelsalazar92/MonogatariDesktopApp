import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import createJiti from "jiti";
const lib = createJiti(import.meta.url)("../lib/note-draft.ts");
const empty = { title: "", content: "", quotedText: "", tags: [], newTag: "", links: [] };
const record = (extra = {}) => ({ version: 1, sessionId: "session", novelId: "novel", noteId: "note", baseRevision: 1, savedAt: 100, attemptedSave: false, fields: { ...empty, title: "Draft", content: "私のノート <script>text</script>", links: [{ type: "Scene", id: "scene" }] }, ...extra });
function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test("Draft validation, limits, local scope and whitelisted data", () => {
  for (const workflowStatus of ["informational", "open", "done"]) {
    const draft = record({ fields: { ...empty, workflowStatus } });
    assert.equal(lib.readNoteDraft(JSON.stringify(draft)).fields.workflowStatus, workflowStatus);
  }
  assert.equal(lib.readNoteDraft(JSON.stringify(record({ fields: { ...empty, workflowStatus: "invalid" } }))), null);
  assert.equal(lib.readNoteDraft(JSON.stringify(record({ fields: { ...empty, quotedText: "x".repeat(100001) } }))), null);
  const s = storage(), d = record();
  lib.storeNoteDraft(s, { ...d, token: "not persisted", fields: { ...d.fields, offsets: [1, 9] } });
  assert.deepEqual(lib.listNoteDrafts(s, "novel", "note"), [d]);
  assert.deepEqual(lib.listNoteDrafts(s, "other", "note"), []);
  assert.deepEqual(lib.listNoteDrafts(s, "novel", null), []);
  assert.equal(lib.readNoteDraft("{"), null);
  assert.equal(lib.readNoteDraft(JSON.stringify(record({ fields: { ...empty, content: "x".repeat(100001) } }))), null);
  assert.equal(lib.readNoteDraft(JSON.stringify(record({ fields: { ...empty, links: [{ type: "Invalid", id: "id" }] } }))), null);
  assert.equal(lib.readNoteDraft("x".repeat(lib.NOTE_DRAFT_LIMIT + 1)), null);
  assert.equal(lib.noteDraftConflict(d, 2), true);
  assert.equal(lib.noteDraftConflict(d, 1), false);
  assert.equal(lib.noteDraftConflict(record({ noteId: null, baseRevision: null }), null), false);
});
test("Sessions coexist, sort newest first, and cannot silently delete newer snapshots", () => {
  const s = storage(), a = record(), b = record({ sessionId: "other", savedAt: 200 });
  lib.storeNoteDraft(s, a); lib.storeNoteDraft(s, b);
  assert.deepEqual(lib.listNoteDrafts(s, "novel", "note"), [b, a]);
  lib.storeNoteDraft(s, { ...a, savedAt: 300 });
  assert.equal(lib.removeNoteDraft(s, a), false);
  assert.equal(s.length, 2);
  assert.equal(lib.removeNoteDraft(s, b), true);
  for (let i = 0; i < 19; i++) lib.storeNoteDraft(s, record({ sessionId: `s${i}` }));
  assert.throws(() => lib.storeNoteDraft(s, record({ sessionId: "overflow" })));
  assert.equal(s.length, 20);
});

// Run the actual hook with effect cleanup, dependency tracking, storage and a controlled clock.
function harness({ drafts = [], revision = 1, noteId = "note" } = {}) {
  const s = storage(); drafts.forEach(d => lib.storeNoteDraft(s, d));
  const savedGlobals = Object.fromEntries(["window", "document", "setTimeout", "clearTimeout", "setInterval", "clearInterval"].map(key => [key, globalThis[key]]));
  const listeners = new Map(), timers = new Map(); let tick = 0, timerId = 0;
  const listen = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  globalThis.window = { localStorage: s, ...listen }; globalThis.document = { visibilityState: "visible", ...listen };
  globalThis.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, at: tick + delay }); return timerId; };
  globalThis.setInterval = (fn, delay) => { timers.set(++timerId, { fn, at: tick + delay, delay }); return timerId; };
  globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
  const cells = []; let cursor = 0, effects = [], result, rerender = false, fields = empty;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { const next = typeof value === "function" ? value(cells[i]) : value; if (!Object.is(next, cells[i])) { cells[i] = next; rerender = true; } }]; },
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) cells[i] = { fn, deps }; return cells[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) { const old = cells[i]; cells[i] = { deps }; effects.push(() => { old?.cleanup?.(); cells[i].cleanup = fn(); }); } }
  };
  const exports = {}, source = readFileSync(new URL("../components/studio/use-note-draft.ts", import.meta.url), "utf8");
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(id => id === "react" ? react : lib, exports);
  const render = () => { let limit = 0; do { assert.ok(++limit < 20, "no render loop"); rerender = false; cursor = 0; result = exports.useNoteDraft({ novelId: "novel", noteId, revision, fields, baseline: empty, onRestore(next) { fields = next; rerender = true; } }); const queue = effects; effects = []; queue.forEach(fn => fn()); } while (rerender); return result; };
  render();
  return {
    s, get current() { return result; }, get fields() { return fields; }, render,
    edit(next) { fields = { ...fields, ...next }; render(); },
    advance(ms) { const end = tick + ms; while (true) { const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!entry) break; const [id, timer] = entry; tick = timer.at; if (timer.delay) timer.at += timer.delay; else timers.delete(id); timer.fn(); render(); } tick = end; },
    event(name) { listeners.get(name)?.({ preventDefault() {} }); render(); },
    close() { cells.forEach(cell => cell?.cleanup?.()); Object.assign(globalThis, savedGlobals); }
  };
}
test("Debounced writes, latest snapshot flush, successful Save cleanup and no resurrection", () => {
  const h = harness();
  try {
    h.edit({ title: "A" }); h.advance(1000); assert.equal(h.s.length, 0);
    h.edit({ content: "long note" }); h.advance(1199); assert.equal(h.s.length, 0);
    h.advance(1); assert.equal(h.s.length, 1); assert.ok(h.current.savedAt);
    h.edit({ content: "latest" }); assert.equal(h.current.savedAt, null);
    h.event("pagehide"); assert.equal(lib.listNoteDrafts(h.s, "novel", "note")[0].fields.content, "latest");
    h.current.markAttempt(); assert.equal(lib.listNoteDrafts(h.s, "novel", "note")[0].attemptedSave, true);
    assert.equal(h.current.markSaved(), true); h.advance(10000); assert.equal(h.s.length, 0);
  } finally { h.close(); }
  assert.equal(h.s.length, 0);
});
test("Reopen offers explicit recovery, stale version blocks until reviewed, discard restores baseline", () => {
  const h = harness({ drafts: [record()], revision: 2 });
  try {
    assert.equal(h.fields.content, ""); assert.equal(h.current.candidates.length, 1);
    h.advance(15000); assert.equal(h.s.length, 1);
    h.current.recover(h.current.candidates[0]); h.render();
    assert.equal(h.current.conflict, true); assert.equal(h.fields.content, record().fields.content);
    h.current.acceptCurrentRevision(); h.render(); assert.equal(h.current.conflict, false);
    h.advance(1200); assert.equal(lib.listNoteDrafts(h.s, "novel", "note")[0].baseRevision, 2);
    h.current.discard(); h.render(); h.advance(10000);
    assert.deepEqual(h.fields, empty); assert.equal(h.s.length, 0); assert.equal(h.current.dirty, false);
  } finally { h.close(); }
});
test("Unmount flushes unsaved create-session; reverting clean removes obsolete autosave", () => {
  const h = harness({ noteId: null });
  h.edit({ content: "captured" }); h.close();
  assert.equal(lib.listNoteDrafts(h.s, "novel", null)[0].fields.content, "captured");
  const clean = harness();
  try { clean.edit({ title: "draft" }); clean.advance(1200); clean.edit(empty); clean.advance(1200); assert.equal(clean.s.length, 0); } finally { clean.close(); }
});
test("Storage failure retains form, warns, and prevents an unprotected close", () => {
  const h = harness();
  try {
    h.s.setItem = () => { throw new Error("quota"); };
    h.edit({ content: "keep me" }); h.advance(1200);
    assert.match(h.current.message, /could not be saved/); assert.equal(h.current.persist(), false);
    assert.equal(h.fields.content, "keep me");
  } finally { h.close(); }
});
