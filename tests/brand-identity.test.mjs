import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/studio/sidebar.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../components/studio/mobile-nav-dialog.tsx", import.meta.url), "utf8");
const brand = readFileSync(new URL("../components/studio/brand-mark.tsx", import.meta.url), "utf8");

test("official Monogatari identity uses one shared mark and browser metadata", () => {
  assert.match(layout, /default: "Monogatari"/);
  assert.match(layout, /template: "%s \| Monogatari"/);
  assert.match(layout, /icon: "\/icon\.svg"/);
  assert.match(sidebar, /BrandLockup/);
  assert.match(sidebar, /BrandMark/);
  assert.match(mobileNav, /BrandLockup/);
  assert.match(brand, /src="\/monogatari-mark\.svg"/);
  assert.ok(existsSync(new URL("../public/monogatari-mark.svg", import.meta.url)));
  assert.ok(existsSync(new URL("../app/icon.svg", import.meta.url)));
  assert.ok(existsSync(new URL("../app/apple-icon.svg", import.meta.url)));
});

test("active user-facing shell no longer uses legacy product names", () => {
  for (const source of [layout, sidebar, mobileNav]) {
    assert.doesNotMatch(source, /Private Novel Studio|Monogatari Studio|Monogatari Desktop/);
  }
});
