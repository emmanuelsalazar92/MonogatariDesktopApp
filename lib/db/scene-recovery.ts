import "server-only";

import crypto from "node:crypto";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  recoveryCheckpointLabel,
  recoveryReasonForContentChange,
  type RecoveryReason
} from "@/lib/scene-recovery";

const RECOVERY_DEDUPLICATION_WINDOW_MS = 5 * 60_000;

type RecoveryScene = {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  revision: number;
};

export async function createRecoveryCheckpoint(
  tx: Prisma.TransactionClient,
  scene: RecoveryScene,
  nextContent: string,
  operation: "scene-update" | "notion-pull" | "version-restore",
  forcedReason?: RecoveryReason
) {
  const reason = forcedReason ?? recoveryReasonForContentChange(scene.content, nextContent);
  if (!reason) return null;

  const recentDuplicate = await tx.sceneVersion.findFirst({
    where: {
      sceneId: scene.id,
      content: scene.content,
      origin: { startsWith: "recovery:" },
      createdAt: { gte: new Date(Date.now() - RECOVERY_DEDUPLICATION_WINDOW_MS) }
    },
    select: { id: true }
  });
  if (recentDuplicate) return null;

  return tx.sceneVersion.create({
    data: {
      id: `scene-version-${crypto.randomUUID()}`,
      sceneId: scene.id,
      title: scene.title,
      content: scene.content,
      wordCount: scene.wordCount,
      label: recoveryCheckpointLabel(reason, scene.revision),
      origin: `recovery:${operation}:${reason}:base-revision-${scene.revision}`
    }
  });
}
