import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared navigation feedback starts immediately, prevents duplicate navigation, and has accessible status", () => {
  const shared = read("components/studio/pending-navigation.tsx");
  const page = read("app/page.tsx");
  assert.match(shared, /export function usePendingNavigation/);
  assert.match(shared, /if \(pendingRef\.current\) return false/);
  assert.match(shared, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(shared, /animate-spin motion-reduce:animate-none/);
  assert.doesNotMatch(shared, /setTimeout|setInterval/);
  assert.match(page, /React\.startTransition/);
  assert.match(page, /if \(!beginNavigation\(page === "editor"/);
  assert.match(page, /finishNavigation\(\);\s*showToast\("Save failed\. Navigation was cancelled/);
  assert.match(page, /<NavigationFeedback label=\{navigationLabel\}/);
});

test("Continue writing and Notion sync communicate pending work without duplicate requests", () => {
  const card = read("components/studio/novel-project-card.tsx");
  const overview = read("components/studio/novel-overview-screen.tsx");
  const page = read("app/page.tsx");
  assert.match(card, /openingEditor = navigationPending && navigationLabel === "Opening editor…"/);
  assert.match(card, /openingEditor \? "Opening editor…" : translate\("Continue writing"\)/);
  assert.match(overview, /disabled=\{syncing\} aria-busy=\{syncing\}/);
  assert.match(overview, /hasRemoteChanges && storedSyncStatus\.kind !== "conflict"/);
  assert.match(overview, /translate\("Update from Notion"\)/);
  assert.match(page, /if \(!currentNovel\.id \|\| notionSyncInFlightRef\.current\) return/);
  assert.match(page, /notionSyncInFlightRef\.current = true/);
  assert.match(page, /notionSyncInFlightRef\.current = false/);
  assert.match(page, /if \(!currentNovel\.id \|\| notionPullInFlightRef\.current\) return/);
});
