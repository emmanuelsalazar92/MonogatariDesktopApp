import "server-only";

import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { prisma } from "@/lib/db/prisma";
import { createBackupRecord, getStudioSettings } from "@/lib/db/studio";
import { backupRetentionLimit } from "@/lib/studio-settings";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function applyConfiguredBackupRetention(backupDirectory: string) {
  const settings = await getStudioSettings();
  const limit = backupRetentionLimit(settings.backupRetention);
  if (!limit) return;

  const snapshots = await prisma.backup.findMany({
    where: { filename: { startsWith: "sqlite-snapshot-" } },
    orderBy: { createdAt: "desc" }
  });
  const expired = snapshots.slice(limit);
  const removedIds: string[] = [];

  for (const snapshot of expired) {
    const filename = snapshot.filename;
    if (
      basename(filename) !== filename ||
      !/^sqlite-snapshot-[\dTZ-]+\.db$/.test(filename)
    ) {
      continue;
    }

    try {
      await unlink(join(backupDirectory, filename));
      removedIds.push(snapshot.id);
    } catch {
      // Retention only removes snapshots it can safely identify and delete.
    }
  }

  if (removedIds.length > 0) {
    await prisma.backup.deleteMany({ where: { id: { in: removedIds } } });
  }
}

export async function createSQLiteSnapshot(status = "Complete") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sqlite-snapshot-${timestamp}.db`;
  const sourcePath = join(process.cwd(), "prisma", "dev.db");
  const backupDirectory = join(process.cwd(), "prisma", "backups");
  const destinationPath = join(backupDirectory, filename);

  await mkdir(backupDirectory, { recursive: true });
  await copyFile(sourcePath, destinationPath);

  const [stats, includedNovels] = await Promise.all([stat(destinationPath), prisma.novel.count()]);
  const backup = await createBackupRecord({
    filename,
    size: formatBytes(stats.size),
    includedNovels,
    status
  });
  await applyConfiguredBackupRetention(backupDirectory);
  return backup;
}
