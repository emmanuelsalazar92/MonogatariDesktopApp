import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import createJiti from "jiti";
const jiti = createJiti(import.meta.url);
const reads = jiti("../lib/relationship-read.ts");
const types = jiti("../lib/character-relationship.ts");
const security = jiti("../lib/request-security.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const row = { id: "r", novelId: "n", fromCharacterId: "a", toCharacterId: "b", revision: 0, archivedAt: null, isSpoiler: false, relationshipType: "mentor_of", category: "Social", direction: "Directional", labelFromTo: "Mentor of", labelToFrom: "Student of", description: "PRIVATE_DESCRIPTION", notes: "PRIVATE_NOTES", since: "PRIVATE_SINCE", status: "PRIVATE_STATUS" };

test("Hide-completely policy agrees for edge and endpoint spoilers and cross-novel records", () => {
  for (const show of [false, true]) {
    assert.equal(types.relationshipIsVisible(row, { novelId: "n" }, { novelId: "other" }, show), false);
    assert.equal(types.relationshipIsVisible(row, undefined, { novelId: "n" }, show), false);
    assert.equal(types.relationshipIsVisible({ ...row, isSpoiler: true }, { novelId: "n" }, { novelId: "n" }, show), show);
    assert.equal(types.relationshipIsVisible(row, { novelId: "n", isSpoiler: true }, { novelId: "n" }, show), show);
  }
  assert.doesNotMatch(JSON.stringify(types.relationshipSummary(row)), /PRIVATE_|description|notes|since|status/);
});

test("LAN origin check handles Next localhost canonicalization without trusting hostile or forwarded origins", () => {
  const check = (origin, host, extra = {}) => security.isTrustedLanMutationRequest(new Request("http://localhost:3012/api/relationships", { method: "POST", headers: { origin, host, ...extra } }));
  assert.equal(check("http://127.0.0.1:3012", "127.0.0.1:3012"), true);
  assert.equal(check("http://192.168.1.4:3012", "192.168.1.4:3012"), true);
  assert.equal(check("http://[::1]:3012", "[::1]:3012"), true);
  assert.equal(check("https://evil.example", "127.0.0.1:3012"), false);
  assert.equal(check("http://evil.example:3012", "evil.example:3012"), false);
  assert.equal(check("http://127.0.0.1:3012", "evil.example:3012", { "x-forwarded-host": "127.0.0.1:3012" }), false);
  assert.equal(check("http://127.0.0.1:3012", "127.0.0.1:3012", { "sec-fetch-site": "cross-site" }), false);
  assert.equal(check("http://127.0.0.1:9999", "127.0.0.1:9999"), false);
  assert.equal(check("null", "127.0.0.1:3012"), false);
});

test("Catalog fetch scopes IDs, fails closed on malformed rows and strips accidental private fields", async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/relationships?novelId=n&lifecycle=active"); assert.equal(options.signal, signal); assert.equal(options.cache, "no-store");
    return Response.json([row, { ...row, novelId: "other" }, { ...row, isSpoiler: true }, { ...row, fromCharacterId: undefined }, { ...row, revision: -1 }]);
  };
  const rows = await reads.loadRelationshipCatalog("n", false, "active", signal);
  assert.deepEqual(rows, [types.relationshipSummary(row)]);
  await assert.rejects(reads.loadRelationshipCatalog("../foreign", false, "active", signal));
});

test("Only selected detail loads; wrong scope, hidden spoilers, server error bodies and aborts never become detail", async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController(); let count = 0;
  globalThis.fetch = async (url, options) => { count++; assert.equal(url, "/api/relationships/r?novelId=n"); assert.equal(options.signal, controller.signal); assert.equal(options.cache, "no-store"); return Response.json(row); };
  assert.deepEqual(await reads.loadRelationshipDetail("n", "r", false, controller.signal), row); assert.equal(count, 1);
  for (const wrong of [{ ...row, id: "other" }, { ...row, novelId: "foreign" }, { ...row, isSpoiler: true }, { ...row, notes: null }]) {
    globalThis.fetch = async () => Response.json(wrong);
    await assert.rejects(reads.loadRelationshipDetail("n", "r", false, controller.signal), /Invalid relationship detail/);
  }
  globalThis.fetch = async () => new Response("PRIVATE_SQL_FAILURE", { status: 500 });
  await assert.rejects(reads.loadRelationshipDetail("n", "r", false, controller.signal), (error) => !error.message.includes("PRIVATE"));
  globalThis.fetch = async (_url, { signal }) => { signal.throwIfAborted(); return Response.json(row); };
  controller.abort(); await assert.rejects(reads.loadRelationshipDetail("n", "r", false, controller.signal), { name: "AbortError" });
});

test("Loaders isolate failure and scope/revision changes, cancel obsolete requests and provide explicit retry", () => {
  const source = read("components/studio/relationship-loaders.tsx");
  assert.match(source, /controller\.abort\(\)/); assert.match(source, /!controller.signal.aborted/);
  assert.match(source, /detail\?\.key === key/); assert.match(source, /rows\?\.key === key/);
  assert.match(source, /summary.revision/); assert.match(source, /Retry detail/); assert.match(source, /Retry catalog/);
  assert.doesNotMatch(source, /console\.|localStorage|dangerouslySetInnerHTML/);
});

test("Narrow detail has modal isolation, explicit back navigation and focus restore while desktop shares graph/list selection", () => {
  const source = read("components/studio/relationship-explorer.tsx"), css = read("app/globals.css");
  assert.match(source, /max-width: 1023px/); assert.match(source, /Back to relationships/);
  assert.match(source, /<Dialog open=\{drawerOpen && Boolean\(selected\)\}/);
  assert.match(source, /onCloseAutoFocus/); assert.match(source, /invoker.current.focus\(\)/);
  assert.match(source, /RelationshipDetailLoader/); assert.match(source, /selectedEdge\?\.id/);
  assert.match(css, /\.relationship-detail-drawer[\s\S]*?height: calc\(100dvh - 1rem\)/);
  assert.match(css, /\.relationship-detail-drawer[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)/);
  const actions = read("components/studio/relationship-actions.tsx");
  assert.match(actions, /aria-label="Delete impact"/); assert.match(actions, /Characters deleted<\/dt><dd>0/);
});
