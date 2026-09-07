import "server-only";

import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { prisma, databasePath, runtimeDataDirectory } from "@/lib/db/prisma";
import { createBackupRecord, getStudioSettings } from "@/lib/db/studio";
import { backupRetentionLimit } from "@/lib/studio-settings";

const backupFormatVersion = 1;
const databaseEntryName = "database.sqlite";
const manifestEntryName = "manifest.json";
let activeOperation: Promise<unknown> | null = null;

export class BackupInProgressError extends Error {}
export class BackupVerificationError extends Error {}
export class RestoreInProgressError extends Error {}
export class RestoreError extends Error {}
type BackupManifest = { formatVersion: number; schemaVersion: number; createdAt: string; appVersion: string; origin: "Manual"; inventory: { novels: number }; files: Array<{ path: string; bytes: number; sha256: string }> };
type BackupResult = Awaited<ReturnType<typeof createBackupRecord>> & { verification: "Valid"; origin: "Manual" };

function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function sha256(data: Buffer) { return crypto.createHash("sha256").update(data).digest("hex"); }
function crc32(data: Buffer) { let value = 0xffffffff; for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function safeEntryPath(path: string) { return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path) && !path.includes("\\") && !path.includes("/"); }

// Store-only ZIP keeps the format portable without adding a native archive dependency.
function createZip(entries: Array<{ name: string; data: Buffer }>) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const { name, data } of entries) {
    if (!safeEntryPath(name)) throw new Error("Unsafe backup entry name");
    const nameBytes = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(local, 30); locals.push(local, data);
    const header = Buffer.alloc(46 + nameBytes.length); header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt32LE(crc, 16); header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(nameBytes.length, 28); header.writeUInt32LE(offset, 42); nameBytes.copy(header, 46); central.push(header); offset += local.length + data.length;
  }
  const directory = Buffer.concat(central), footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50, 0); footer.writeUInt16LE(entries.length, 8); footer.writeUInt16LE(entries.length, 10); footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, footer]);
}
function readZipEntries(archive: Buffer) {
  const entries = new Map<string, Buffer>(); let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8), crc = archive.readUInt32LE(offset + 14), size = archive.readUInt32LE(offset + 22), nameSize = archive.readUInt16LE(offset + 26), extraSize = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameSize).toString("utf8"), start = offset + 30 + nameSize + extraSize, data = archive.subarray(start, start + size);
    if (method !== 0 || !safeEntryPath(name) || data.length !== size || crc32(data) !== crc || entries.has(name)) throw new BackupVerificationError("Backup ZIP structure is invalid");
    entries.set(name, data); offset = start + size;
  }
  return entries;
}
export async function verifyBackupPackage(path: string) {
  const entries = readZipEntries(await readFile(path)), manifestData = entries.get(manifestEntryName), databaseData = entries.get(databaseEntryName);
  if (!manifestData || !databaseData || entries.size !== 2) throw new BackupVerificationError("Backup is missing required files");
  let manifest: BackupManifest; try { manifest = JSON.parse(manifestData.toString("utf8")); } catch { throw new BackupVerificationError("Backup manifest is invalid"); }
  if (manifest.formatVersion !== backupFormatVersion || manifest.schemaVersion !== 1 || manifest.origin !== "Manual" || !Array.isArray(manifest.files)) throw new BackupVerificationError("Unsupported backup manifest");
  const dbEntry = manifest.files.find((entry) => entry.path === databaseEntryName);
  if (!dbEntry || dbEntry.bytes !== databaseData.length || dbEntry.sha256 !== sha256(databaseData)) throw new BackupVerificationError("Backup checksum failed");
  const directory = await mkdtemp(join(tmpdir(), "monogatari-backup-verify-")), checkPath = join(directory, databaseEntryName);
  try { await writeFile(checkPath, databaseData); const db = new Database(checkPath, { readonly: true }); try { const rows = db.prepare("PRAGMA integrity_check").all() as Array<Record<string, string>>; if (!rows.length || rows.some((row) => Object.values(row)[0] !== "ok")) throw new BackupVerificationError("SQLite integrity check failed"); db.prepare("SELECT count(*) FROM Novel").get(); } finally { db.close(); } }
  finally { await rm(directory, { recursive: true, force: true }); }
  return manifest;
}
async function applyConfiguredBackupRetention(directory: string) {
  const limit = backupRetentionLimit((await getStudioSettings()).backupRetention); if (!limit) return;
  const backups = await prisma.backup.findMany({ where: { filename: { startsWith: "monogatari-backup-" }, status: "Manual · Valid" }, orderBy: { createdAt: "desc" } }); const ids: string[] = [];
  for (const backup of backups.slice(limit)) if (/^monogatari-backup-[\dTZ-]+\.zip$/.test(backup.filename)) try { await unlink(join(directory, backup.filename)); ids.push(backup.id); } catch { /* preserve metadata when safe deletion fails */ }
  if (ids.length) await prisma.backup.deleteMany({ where: { id: { in: ids } } });
}
async function createManualBackup(status = "Manual · Valid"): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-"), filename = `monogatari-backup-${timestamp}.zip`, directory = join(runtimeDataDirectory, "backups"), temporary = await mkdtemp(join(tmpdir(), "monogatari-backup-")), snapshotPath = join(temporary, databaseEntryName), packagePath = join(temporary, filename), destination = join(directory, filename);
  try {
    await mkdir(directory, { recursive: true }); const source = new Database(databasePath, { readonly: true }); try { await source.backup(snapshotPath); } finally { source.close(); }
    const database = await readFile(snapshotPath), inspected = new Database(snapshotPath, { readonly: true }); let novels = 0;
    try { novels = Number((inspected.prepare("SELECT count(*) AS count FROM Novel").get() as { count: number }).count); } finally { inspected.close(); }
    const manifest: BackupManifest = { formatVersion: backupFormatVersion, schemaVersion: 1, createdAt: new Date().toISOString(), appVersion: process.env.npm_package_version ?? "unknown", origin: "Manual", inventory: { novels }, files: [{ path: databaseEntryName, bytes: database.length, sha256: sha256(database) }] };
    await writeFile(packagePath, createZip([{ name: databaseEntryName, data: database }, { name: manifestEntryName, data: Buffer.from(JSON.stringify(manifest)) }])); await verifyBackupPackage(packagePath); await rename(packagePath, destination);
    const result = await createBackupRecord({ filename, size: formatBytes((await stat(destination)).size), includedNovels: novels, status }); await applyConfiguredBackupRetention(directory); return { ...result, verification: "Valid", origin: "Manual" };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
async function validateSQLiteDatabase(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check").all() as Array<Record<string, string>>;
    if (!rows.length || rows.some((row) => Object.values(row)[0] !== "ok")) throw new RestoreError("Restored SQLite integrity check failed");
    db.prepare("SELECT count(*) FROM Novel").get();
  } finally { db.close(); }
}
async function restoreVerifiedBackup(backupId: string) {
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup || !backup.status.endsWith("Valid") || !/^monogatari-backup-[\dTZ-]+\.zip$/.test(backup.filename)) throw new RestoreError("Only a verified compatible backup can be restored");
  const directory = join(runtimeDataDirectory, "backups"), packagePath = join(directory, backup.filename);
  await verifyBackupPackage(packagePath); // Do not trust a previous UI inspection.
  const preRestore = await createManualBackup("Pre-restore · Valid"); // Mandatory and verified before any swap.
  const temporary = await mkdtemp(join(tmpdir(), "monogatari-restore-")), candidate = join(temporary, databaseEntryName), rollback = `${databasePath}.restore-rollback`;
  try {
    const entries = readZipEntries(await readFile(packagePath)), database = entries.get(databaseEntryName);
    if (!database) throw new RestoreError("Backup database is missing");
    await writeFile(candidate, database); await validateSQLiteDatabase(candidate);
    // Stop the Prisma writer before the atomic rename. The caller must reload after success.
    await prisma.$disconnect();
    await rename(databasePath, rollback);
    try {
      await rename(candidate, databasePath); await validateSQLiteDatabase(databasePath);
      await rm(rollback, { force: true });
      return { state: "Complete" as const, preRestore, reloadRequired: true };
    } catch (error) {
      await rm(databasePath, { force: true }); await rename(rollback, databasePath);
      throw new RestoreError(error instanceof Error ? `Restore rolled back: ${error.message}` : "Restore rolled back");
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export class BackupService {
  createManual(status?: string) { return createManualBackup(status); }
  verify(path: string) { return verifyBackupPackage(path); }
  restore(backupId: string) { return restoreVerifiedBackup(backupId); }
}
export const backupService = new BackupService();

// Compatibility entry point for Notion conflict recovery and future automatic jobs.
export function createSQLiteSnapshot(status?: string) {
  if (activeOperation) throw new BackupInProgressError("A backup or restore operation is already in progress");
  const operation = backupService.createManual(status);
  activeOperation = operation.finally(() => { activeOperation = null; });
  return operation;
}
export function restoreSQLiteSnapshot(backupId: string) {
  if (activeOperation) throw new RestoreInProgressError("A backup or restore operation is already in progress");
  const operation = backupService.restore(backupId);
  activeOperation = operation.finally(() => { activeOperation = null; });
  return operation;
}
