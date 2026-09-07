"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { Novel } from "@/lib/studio-domain";

export type NovelLifecycleAction = "archive" | "restore";

export function NovelLifecycleDialog({
  target,
  saving,
  error,
  translate,
  onOpenChange,
  onConfirm
}: {
  target: { novel: Novel; action: NovelLifecycleAction } | null;
  saving: boolean;
  error: string;
  translate: (value: string) => string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!target) return null;
  const archive = target.action === "archive";
  const actionLabel = archive ? translate("Archive novel") : translate("Restore novel");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeDisabled={saving} className="motion-reduce:duration-0">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {archive
              ? translate("Archive this project? The manuscript, structure, metadata, Notion mapping, and backups will be kept.")
              : translate("Restore this project to its previous lifecycle status. Its manuscript, structure, metadata, Notion mapping, and backups remain unchanged.")}
          </DialogDescription>
        </DialogHeader>
        <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{target.novel.title}</p>
        {error ? <p role="alert" className="text-sm text-destructive">{translate(error)}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {translate("Cancel")}
          </Button>
          <Button type="button" variant={archive ? "destructive" : "default"} disabled={saving} onClick={onConfirm}>
            {saving ? translate(archive ? "Archiving…" : "Restoring…") : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
