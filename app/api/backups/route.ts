import { mkdir, stat, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createBackupRecord } from "@/lib/db/studio";
import { prisma } from "@/lib/db/prisma";

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function POST() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sqlite-snapshot-${timestamp}.db`;
  const sourcePath = join(process.cwd(), "prisma", "dev.db");
  const backupDirectory = join(process.cwd(), "prisma", "backups");
  const destinationPath = join(backupDirectory, filename);

  await mkdir(backupDirectory, { recursive: true });
  await copyFile(sourcePath, destinationPath);

  const [stats, includedNovels] = await Promise.all([
    stat(destinationPath),
    prisma.novel.count()
  ]);

  const backup = await createBackupRecord({
    filename,
    size: formatBytes(stats.size),
    includedNovels,
    status: "Complete"
  });

  return NextResponse.json(backup, { status: 201 });
}
