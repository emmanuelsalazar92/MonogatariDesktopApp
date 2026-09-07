import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function clone(value) {
  return value ? { ...value } : value;
}

function createStateHarness(initial) {
  let row = clone(initial);
  let operation = 0;
  const matches = (where) => {
    if (!row || (where.novelId && row.novelId !== where.novelId)) return false;
    if (where.syncStatus !== undefined) {
      if (typeof where.syncStatus === "string" && row.syncStatus !== where.syncStatus) return false;
      if (where.syncStatus?.not && row.syncStatus === where.syncStatus.not) return false;
    }
    if (where.syncOperationId !== undefined && row.syncOperationId !== where.syncOperationId) return false;
    if (where.revision !== undefined && row.revision !== where.revision) return false;
    if (where.OR) return where.OR.some((condition) => {
      if (condition.syncLeaseExpiresAt === null) return row.syncLeaseExpiresAt === null;
      const deadline = condition.syncLeaseExpiresAt?.lt;
      return deadline instanceof Date && row.syncLeaseExpiresAt instanceof Date && row.syncLeaseExpiresAt < deadline;
    });
    return true;
  };
  const delegate = {
    async upsert({ create }) {
      if (!row) row = { revision: 0, lastSyncedRevision: 0, lastNotionSync: null, lastKnownContent: "{}", syncStatus: "idle", syncOperationId: null, syncStartedAt: null, syncLeaseExpiresAt: null, syncSnapshotRevision: null, lastSyncError: null, ...create };
      return clone(row);
    },
    async findUnique() { return clone(row); },
    async updateMany({ where, data }) {
      if (!matches(where)) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    },
    async update({ data }) {
      row = { ...row, ...data };
      return clone(row);
    }
  };
  const prisma = {
    notionSyncState: delegate,
    async $transaction(callback) { return callback({ notionSyncState: delegate }); }
  };
  const source = readFileSync(new URL("../lib/db/notion-sync.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "module", output)(
    (id) => {
      if (id === "server-only") return {};
      if (id === "node:crypto") return { randomUUID: () => `operation-${++operation}` };
      if (id === "@/lib/db/prisma") return { prisma };
      throw new Error(`Unexpected module ${id}`);
    },
    exports,
    { exports }
  );
  return { api: exports, get row() { return clone(row); }, set row(value) { row = clone(value); } };
}

function syncRow(overrides = {}) {
  return {
    novelId: "novel-a",
    isDirty: true,
    revision: 125,
    lastSyncedRevision: 120,
    lastNotionSync: null,
    lastKnownContent: "{}",
    syncStatus: "idle",
    syncOperationId: null,
    syncStartedAt: null,
    syncLeaseExpiresAt: null,
    syncSnapshotRevision: null,
    lastSyncError: null,
    ...overrides
  };
}

test("persistent operation lock survives a repeated Sync request and records its snapshot", async () => {
  const harness = createStateHarness(syncRow());
  const first = await harness.api.beginNotionSyncOperation("novel-a");
  const second = await harness.api.beginNotionSyncOperation("novel-a");

  assert.equal(first.kind, "started");
  assert.equal(second.kind, "existing");
  assert.equal(second.operationId, first.operationId);
  assert.equal(harness.row.syncStatus, "syncing");
  assert.equal(harness.row.syncSnapshotRevision, 125);
  assert.ok(harness.row.syncStartedAt instanceof Date);
  assert.ok(harness.row.syncLeaseExpiresAt instanceof Date);
});

test("completion records the snapshot but keeps later local revisions pending", async () => {
  const harness = createStateHarness(syncRow());
  const operation = await harness.api.beginNotionSyncOperation("novel-a");
  harness.row = { ...harness.row, revision: 128, isDirty: true };

  const result = await harness.api.markNotionSynced("novel-a", { chapter: { local: "a", remote: "a" } }, 125, operation.operationId);
  assert.equal(result.applied, true);
  assert.equal(harness.row.lastSyncedRevision, 125);
  assert.equal(harness.row.revision, 128);
  assert.equal(harness.row.isDirty, true);
  assert.equal(harness.row.syncStatus, "idle");
});

test("stale and late operations never become Synced by assumption", async () => {
  const harness = createStateHarness(syncRow({
    syncStatus: "syncing",
    syncOperationId: "old-operation",
    syncSnapshotRevision: 125,
    syncLeaseExpiresAt: new Date(Date.now() - 1)
  }));
  await harness.api.recoverStaleNotionSyncStates(new Date());
  assert.equal(harness.row.syncStatus, "error");
  assert.equal(harness.row.isDirty, true);
  assert.equal(harness.row.syncOperationId, null);

  harness.row = syncRow({
    syncStatus: "syncing",
    syncOperationId: "new-operation",
    syncSnapshotRevision: 128
  });
  const late = await harness.api.markNotionSynced("novel-a", {}, 125, "old-operation");
  assert.equal(late.applied, false);
  assert.equal(harness.row.syncOperationId, "new-operation");
  assert.equal(harness.row.lastSyncedRevision, 120);
});

test("routes and surfaces observe canonical state without creating sync work during hydration", () => {
  const sync = readFileSync(new URL("../lib/notion-sync.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../lib/db/notion-sync.ts", import.meta.url), "utf8");
  const snapshot = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/integrations/notion/sync/route.ts", import.meta.url), "utf8");

  assert.match(db, /NOTION_SYNC_LEASE_MS = 30 \* 60_000/);
  assert.match(db, /syncOperationId/);
  assert.match(db, /syncSnapshotRevision/);
  assert.match(db, /recoverStaleNotionSyncStates/);
  assert.match(sync, /beginNotionSyncOperation/);
  assert.match(sync, /state\.syncOperationId !== operationId/);
  assert.match(sync, /failNotionSyncOperation/);
  assert.doesNotMatch(snapshot, /recoverStaleNotionSyncStates\(/, "reading an overview never mutates sync state");
  assert.match(snapshot, /syncStatus: state\.syncStatus/);
  assert.match(page, /currentNotionSyncState\?\.syncStatus !== "syncing"/);
  assert.match(page, /setInterval\(\(\) => \{\s*void refreshStudioData\(false\)/);
  assert.match(route, /isTrustedMutationRequest/);
  assert.match(route, /status: result\.operationStatus === "syncing" \? 202 : 200/);
  assert.doesNotMatch(snapshot, /\/sync|\/pull|\/publish|fetch\(/);
});
