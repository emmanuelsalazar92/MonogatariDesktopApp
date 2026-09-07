import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTypeScript(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleRecord = { exports: {} };
  new Function("require", "exports", "module", output)(
    (id) => {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Unexpected module: ${id}`);
    },
    moduleRecord.exports,
    moduleRecord
  );
  return moduleRecord.exports;
}

const requestContext = loadTypeScript("lib/place-request.ts", {
  "@/lib/studio-routes": { isValidNovelRouteId: (id) => /^[a-z][a-z0-9-]*$/.test(id) }
});
const placeRoute = loadTypeScript("app/api/places/[placeId]/route.ts", {
  "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
  "@/lib/db/places": { getPlace: async (novelId, placeId) => ({ novelId, id: placeId }) },
  "@/lib/place-lifecycle": { readPlaceDeleteConfirmation: () => null },
  "@/lib/place-metadata": { validatePlaceMetadata: () => ({ ok: true, data: {} }) },
  "@/lib/place-request": requestContext,
  "@/lib/studio-routes": { isValidPlaceRouteId: (id) => /^[a-z][a-z0-9-]*$/.test(id) },
  "@/lib/request-security": { isTrustedMutationRequest: () => true },
  "../errors": { placeErrorResponse: () => Response.json({ error: "unexpected" }, { status: 500 }) }
});

function placeRequest({ url = "http://localhost:3000/api/places/place-a?novelId=novel-a", host, referer } = {}) {
  return new Request(url, { headers: { ...(host ? { host } : {}), ...(referer ? { referer } : {}) } });
}

test("LAN-origin Place API requests accept their matching Host when Next canonicalizes request.url", async () => {
  const request = placeRequest({
    host: "192.168.50.27:3000",
    referer: "http://192.168.50.27:3000/novels/novel-a/places/place-a"
  });
  const result = requestContext.resolvePlaceNovelId(request);
  assert.deepEqual(result, { ok: true, novelId: "novel-a" });
  const response = await placeRoute.GET(request, { params: Promise.resolve({ placeId: "place-a" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { novelId: "novel-a", id: "place-a" });
});

test("direct deep links and an origin change reconstruct context from the URL without persistent browser state", () => {
  const localhost = requestContext.resolvePlaceNovelId(placeRequest({
    host: "localhost:3000",
    referer: "http://localhost:3000/novels/novel-a/places/place-a"
  }));
  const lan = requestContext.resolvePlaceNovelId(placeRequest({
    host: "192.168.50.27:3000",
    referer: "http://192.168.50.27:3000/novels/novel-a/places/place-a"
  }));
  const refreshed = requestContext.resolvePlaceNovelId(placeRequest({ host: "192.168.50.27:3000" }));

  assert.deepEqual(localhost, { ok: true, novelId: "novel-a" });
  assert.deepEqual(lan, { ok: true, novelId: "novel-a" });
  assert.deepEqual(refreshed, { ok: true, novelId: "novel-a" });
});

test("concurrent explicit novel contexts remain independent while a genuine ownership-context mismatch is rejected", () => {
  const clientA = requestContext.resolvePlaceNovelId(placeRequest({
    url: "http://localhost:3000/api/places/place-a?novelId=novel-a",
    host: "192.168.50.27:3000",
    referer: "http://192.168.50.27:3000/novels/novel-a/places/place-a"
  }));
  const clientB = requestContext.resolvePlaceNovelId(placeRequest({
    url: "http://localhost:3000/api/places/place-b?novelId=novel-b",
    host: "192.168.50.27:3000",
    referer: "http://192.168.50.27:3000/novels/novel-b/places/place-b"
  }));
  const mismatch = requestContext.resolvePlaceNovelId(placeRequest({
    host: "192.168.50.27:3000",
    referer: "http://192.168.50.27:3000/novels/novel-b/places/place-a"
  }));

  assert.deepEqual(clientA, { ok: true, novelId: "novel-a" });
  assert.deepEqual(clientB, { ok: true, novelId: "novel-b" });
  assert.deepEqual(mismatch, {
    ok: false,
    error: "Novel context does not match the open workspace",
    status: 409
  });
});
