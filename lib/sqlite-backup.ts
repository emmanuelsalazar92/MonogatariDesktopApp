import "server-only";

import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/db/prisma";
import { createBackupRecord } from "@/lib/db/studio";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  return createBackupRecord({
    filename,
    size: formatBytes(stats.size),
    includedNovels,
    status
  });
}
