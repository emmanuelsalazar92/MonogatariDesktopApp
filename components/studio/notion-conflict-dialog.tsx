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

export type NotionConflictChoice = "keep-local" | "accept-remote" | "cancel";

export type NotionConflictPreview = {
  chapterId: string;
  chapterTitle: string;
  localContent: string;
  remoteContent: string;
};

export function NotionConflictDialog({
  conflict,
  translate,
  resolving,
  onResolve
}: {
  conflict: NotionConflictPreview | null;
  translate: (value: string) => string;
  resolving: boolean;
  onResolve: (choice: NotionConflictChoice) => void;
}) {
  return (
    <Dialog open={Boolean(conflict)} onOpenChange={(open) => !open && onResolve("cancel")}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{translate("Notion conflict detected")}</DialogTitle>
          <DialogDescription>
            {translate("Both versions changed since the last sync. Choose the version to keep for")}{" "}
            <span className="font-medium text-foreground">{conflict?.chapterTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-border/60 bg-surface/70 p-4">
            <h3 className="mb-2 text-sm font-semibold">{translate("Local version")}</h3>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
              {conflict?.localContent}
            </pre>
          </section>
          <section className="min-w-0 rounded-lg border border-border/60 bg-surface/70 p-4">
            <h3 className="mb-2 text-sm font-semibold">{translate("Notion version")}</h3>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
              {conflict?.remoteContent}
            </pre>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve("cancel")} disabled={resolving}>
            {translate("Cancel")}
          </Button>
          <Button variant="outline" onClick={() => onResolve("keep-local")} disabled={resolving}>
            {translate("Keep local")}
          </Button>
          <Button onClick={() => onResolve("accept-remote")} disabled={resolving}>
            {resolving ? translate("Resolving conflict...") : translate("Accept Notion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
