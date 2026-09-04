import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("fixed identity centralizes the requested palette and keeps selection visually distinct", () => {
  const css = read("app/globals.css");
  const expected = {
    background: "247 246 242", surface: "255 255 255", "surface-secondary": "241 242 244",
    border: "217 220 225", "border-subtle": "231 232 235", "text-primary": "37 40 45",
    "text-secondary": "98 104 114", "text-muted": "133 139 148", primary: "53 74 103",
    "primary-hover": "44 62 87", "primary-active": "36 51 72", "primary-subtle": "232 237 243",
    "focus-ring": "111 135 165", "selection-background": "201 216 234", "selection-text": "24 36 51",
    danger: "180 71 71", success: "71 122 91", warning: "164 119 50"
  };
  for (const [token, value] of Object.entries(expected)) assert.match(css, new RegExp(`--${token}: ${value};`));
  assert.match(css, /::selection\s*\{[^}]*background: rgb\(var\(--selection-background\)\);[^}]*color: rgb\(var\(--selection-text\)\);/s);
  assert.match(read("components/studio/character-highlight-preview.tsx"), /bg-primary-subtle/);
});

test("theme switching, persistence and OS dark-mode detection are absent", () => {
  const sources = [
    "app/page.tsx", "app/globals.css", "components/studio/settings-screen.tsx", "lib/studio-data.ts",
    "lib/studio-settings.ts", "lib/reader-preferences.ts", "tailwind.config.ts", "prisma/seed.js"
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /prefers-color-scheme|classList\.toggle\(["']dark|darkMode|dark:|\.dark\s*\{/);
  assert.doesNotMatch(sources, /defaultReadingMode|readerTheme|onThemeChange|\btheme:\s*["'](?:light|dark|system|Sepia)/i);
  assert.doesNotMatch(read("components/studio/settings-screen.tsx"), />Theme<|label=\{copy\.theme\}|Reading theme/);
});

