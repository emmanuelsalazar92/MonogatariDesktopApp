import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const selectSource = readFileSync(new URL("../components/ui/select.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("shared Select surfaces remain opaque in every interactive state", () => {
  assert.match(selectSource, /bg-surface-elevated px-3 py-2/);
  assert.doesNotMatch(selectSource, /bg-surface-elevated\/95/);
  assert.match(selectSource, /bg-popover text-popover-foreground shadow-lift/);
  assert.doesNotMatch(selectSource, /bg-popover\/98|backdrop-blur-sm/);
  assert.match(selectSource, /bg-popover py-2 pl-8/);
  assert.match(selectSource, /hover:bg-secondary focus:bg-secondary/);
  assert.match(selectSource, /data-\[highlighted\]:bg-secondary data-\[state=checked\]:bg-secondary/);
});

test("dialog panels use the opaque shared dialog surface while the separate backdrop stays separate", () => {
  assert.match(dialogSource, /className=\{cn\(\s*"dialog-surface fixed/);
  assert.match(globalsSource, /\.dialog-surface\s*\{\s*background-color: rgb\(var\(--popover\)\);/);
});
