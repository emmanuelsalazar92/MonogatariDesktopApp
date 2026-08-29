"use client";

import * as React from "react";
import { BookMarked, ChevronDown, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { navigationItems, type PageId } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

const globalPages: PageId[] = ["dashboard", "library"];
const workspacePages: PageId[] = ["overview", "structure", "editor", "reader"];
const storyBiblePages: PageId[] = ["characters", "places", "relationships", "timeline", "notes"];
const utilityPages: PageId[] = ["export", "backups", "settings"];

function itemsFor(pages: PageId[]) {
  return pages.map((page) => navigationItems.find((item) => item.id === page)).filter(
    (item): item is (typeof navigationItems)[number] => Boolean(item)
  );
}

export function MobileNavDialog({
  open,
  activePage,
  labels,
  description,
  hasNovelContext,
  readerOptimized = false,
  onOpenChange,
  onSelectPage
}: {
  open: boolean;
  activePage: PageId;
  labels: Record<PageId, string>;
  description: string;
  hasNovelContext: boolean;
  readerOptimized?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPage: (page: PageId) => void;
}) {
  const storyBibleActive = storyBiblePages.includes(activePage);
  const [storyBibleOpen, setStoryBibleOpen] = React.useState(storyBibleActive);

  React.useEffect(() => {
    if (storyBibleActive) setStoryBibleOpen(true);
  }, [storyBibleActive]);

  const renderItems = (pages: PageId[]) =>
    itemsFor(pages).map((item) => {
      const Icon = item.icon;
      const active = activePage === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectPage(item.id)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-muted-foreground transition-colors hover:bg-secondary/72 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active && "bg-primary text-primary-foreground shadow-paper-sm hover:bg-primary hover:text-primary-foreground"
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{labels[item.id]}</span>
          {active ? <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span> : null}
        </button>
      );
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (window.matchMedia(readerOptimized ? "(max-width: 1023px)" : "(max-width: 767px)").matches) {
            document.getElementById("mobile-navigation-toggle")?.focus();
          }
        }}
        className="left-0 top-0 grid h-full max-h-none w-[88vw] max-w-sm translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-y-0 border-l-0 p-0"
      >
        <DialogHeader className="border-b border-border/55 px-5 py-4 pr-12">
          <DialogTitle>Private Novel Studio</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <nav aria-label="Studio navigation" className="hide-scrollbar min-h-0 overflow-y-auto px-3 py-4">
          <div className="grid gap-1.5">{renderItems(globalPages)}</div>

          {hasNovelContext ? (
            <section className="mt-4" aria-label="Novel workspace">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
              <div className="grid gap-1.5">{renderItems(workspacePages)}</div>
            </section>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border/65 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Select a novel from Library to open its workspace.
            </p>
          )}

          {hasNovelContext ? (
            <section className="mt-4" aria-label="Story Bible">
              <button
                type="button"
                aria-expanded={storyBibleOpen}
                aria-controls="mobile-story-bible-navigation"
                onClick={() => setStoryBibleOpen((value) => !value)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-secondary/72 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  storyBibleActive && "text-foreground"
                )}
              >
                <BookMarked className="size-4 shrink-0" />
                <span className="flex-1">Story Bible</span>
                {storyBibleOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              {storyBibleOpen ? (
                <div id="mobile-story-bible-navigation" role="group" aria-label="Story Bible destinations" className="mt-1 grid gap-1.5 border-l border-border/60 pl-3">
                  {renderItems(storyBiblePages)}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="mt-4" aria-label="Utilities">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Utilities</p>
            <div className="grid gap-1.5">{renderItems(utilityPages)}</div>
          </section>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
