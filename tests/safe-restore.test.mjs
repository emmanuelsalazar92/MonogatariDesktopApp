import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const service = await readFile(resolve("lib/sqlite-backup.ts"), "utf8");
const route = await readFile(resolve("app/api/backups/restore/route.ts"), "utf8");

test("restore revalidates, creates a mandatory Pre-restore snapshot, then validates atomic swap with rollback", () => {
  for (const value of ["await verifyBackupPackage(packagePath)", 'createManualBackup("Pre-restore · Valid")', "await prisma.$disconnect()", "await rename(databasePath, rollback)", "await validateSQLiteDatabase(databasePath)", "Restore rolled back"]) assert.ok(service.includes(value), `missing ${value}`);
  assert.match(service, /if \(activeOperation\) throw new RestoreInProgressError/);
});

test("restore endpoint requires an explicit confirmed valid backup request", () => {
  assert.match(route, /input\.confirmed !== true/);
  assert.match(route, /restoreSQLiteSnapshot\(input\.backupId\)/);
});
