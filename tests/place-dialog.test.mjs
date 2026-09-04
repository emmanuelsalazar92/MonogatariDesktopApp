import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared dialog surface uses the single opaque fixed identity", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.dialog-surface\s*\{\s*background-color: rgb\(var\(--popover\)\);/);
  const block = css.slice(css.indexOf(":root {")).split("}")[0];
  assert.match(block, /--popover: var\(--surface\);/);
  assert.match(block, /--popover-foreground: var\(--text-primary\);/);
  assert.doesNotMatch(css, /\.dark\s*\{/);
  const dialog = read("components/ui/dialog.tsx");
  const surface = dialog.split('"dialog-surface')[1].split('"')[0];
  assert.doesNotMatch(surface, /opacity-|fade-|animate-/);
  assert.match(dialog, /inset-0 z-50/);
  assert.match(surface, /z-\[51\]/);
  assert.match(read("components/ui/select.tsx"), /z-\[60\]/);
});

test("Place dialog retains modal primitives and restores its invoker", () => {
  const source = read("components/studio/place-form-dialog.tsx");
  assert.match(source, /<Dialog open modal/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /id="place-name" autoFocus required/);
  assert.match(source, /onCloseAutoFocus=/);
  assert.match(source, /invoker\.isConnected/);
  assert.match(source, /invoker\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /!open && !saving/);
  assert.match(source, /closeDisabled=\{saving\}/);
  assert.match(read("components/ui/dialog.tsx"), /DialogPrimitive\.Close disabled=\{closeDisabled\}/);
});
