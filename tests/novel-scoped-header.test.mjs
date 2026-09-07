import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("../components/studio/top-bar.tsx", import.meta.url), "utf8");

test("novel routes suppress the shared selector while global pages retain it", () => {
  assert.match(appSource, /showNovelSelector=\{!activeRoute\?\.novelId\}/);
  assert.match(topBarSource, /showNovelSelector = true/);
  assert.match(topBarSource, /showNovelSelector && novels\.length/);
});
