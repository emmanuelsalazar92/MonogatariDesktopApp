import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve("lib/sqlite-backup.ts"), "utf8");

test("manual backup uses a consistent SQLite backup API before packaging", () => {
  assert.match(source, /export class BackupService/);
  assert.match(source, /await source\.backup\(snapshotPath\)/);
  assert.doesNotMatch(source, /copyFile\(/);
  assert.match(source, /let activeOperation: Promise<unknown> \| null/);
  assert.match(source, /throw new BackupInProgressError/);
});

test("backup manifest and verifier reject accidental corruption and host-specific paths", () => {
  for (const value of ["formatVersion", "schemaVersion", "sha256", "PRAGMA integrity_check", "Backup checksum failed", "database.sqlite", "manifest.json", "origin: \"Manual\""]) assert.ok(source.includes(value), `missing ${value}`);
  assert.match(source, /!safeEntryPath\(name\)/);
  assert.match(source, /entries\.size !== 2/);
  assert.doesNotMatch(source, /process\.cwd\(\).*manifest/);
  assert.doesNotMatch(source, /\\\\Writing\\\\|192\.168\.|localhost/);
});

test("only verified packages are promoted and recorded as recoverable", () => {
  assert.match(source, /await verifyBackupPackage\(packagePath\); await rename\(packagePath, destination\)/);
  assert.match(source, /status: "Manual · Valid"/);
  assert.match(source, /finally \{ await rm\(temporary, \{ recursive: true, force: true \}\); \}/);
  assert.match(source, /status: "Manual · Valid"/);
});
