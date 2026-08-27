"use client";

import * as React from "react";
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine
} from "lucide-react";

import { ToolbarIconButton } from "@/components/studio/shared";
import { navigationItems, type PageId, type SidebarState } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

type SidebarCopy = {
  appSubtitle: string;
  expandedSidebar: string;
  compactSidebar: string;
  hideSidebar: string;
};

const globalPages: PageId[] = ["dashboard", "library"];
const workspacePages: PageId[] = ["overview", "structure", "editor", "reader"];
const storyBiblePages: PageId[] = ["characters", "places", "relationships", "timeline", "notes"];
const utilityPages: PageId[] = ["export", "backups"];

function itemsFor(pages: PageId[]) {
  return pages.map((page) => navigationItems.find((item) => item.id === page)).filter(
    (item): item is (typeof navigationItems)[number] => Boolean(item)
  );
}

export function Sidebar({
  activePage,
  sidebarState,
  labels,
  copy,
  hasNovelContext,
  onSelectPage,
  onSidebarStateChange
}: {
  activePage: PageId;
  sidebarState: SidebarState;
  labels: Record<PageId, string>;
  copy: SidebarCopy;
  hasNovelContext: boolean;
  onSelectPage: (page: PageId) => void;
  onSidebarStateChange: (state: SidebarState) => void;
}) {
  const compact = sidebarState === "compact";
  const storyBibleActive = storyBiblePages.includes(activePage);
  const [storyBibleOpen, setStoryBibleOpen] = React.useState(storyBibleActive);

  React.useEffect(() => {
    if (storyBibleActive) setStoryBibleOpen(true);
  }, [storyBibleActive]);

  if (sidebarState === "hidden") return null;

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
            "group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-secondary/74 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact && "justify-center px-0",
            active &&
              "bg-primary text-primary-foreground shadow-paper-sm hover:bg-primary hover:text-primary-foreground"
          )}
          title={compact ? labels[item.id] : undefined}
        >
          <Icon className={cn("size-4 shrink-0", !active && "text-muted-foreground/90 group-hover:text-foreground")} />
          {!compact ? <span className="min-w-0 flex-1 truncate">{labels[item.id]}</span> : null}
          {active && !compact ? <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span> : null}
        </button>
      );
    });

  return (
    <aside
      className={cn(
        "surface-panel sticky top-0 hidden h-screen shrink-0 border-r border-border/55 md:block",
        compact ? "w-20" : "w-72"
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn("flex items-center gap-3 border-b border-border/55 px-4 py-4", compact && "justify-center")}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-paper-sm">
            <PenLine className="size-5" />
          </div>
          {!compact ? (
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">Private Novel Studio</p>
              <p className="truncate text-xs text-muted-foreground">{copy.appSubtitle}</p>
            </div>
          ) : null}
        </div>

        <nav aria-label="Studio navigation" className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="grid gap-1.5">{renderItems(globalPages)}</div>

          {hasNovelContext ? (
            <section className="mt-4" aria-label="Novel workspace">
              {!compact ? <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p> : null}
              <div className="grid gap-1.5">{renderItems(workspacePages)}</div>
            </section>
          ) : !compact ? (
            <p className="mt-4 rounded-lg border border-dashed border-border/65 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Select a novel from Library to open its workspace.
            </p>
          ) : null}

          {hasNovelContext ? (
            <section className="mt-4" aria-label="Story Bible">
              <button
                type="button"
                aria-expanded={storyBibleOpen}
                aria-controls="story-bible-navigation"
                onClick={() => setStoryBibleOpen((open) => !open)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-secondary/74 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  compact && "justify-center px-0",
                  storyBibleActive && "text-foreground"
                )}
                title={compact ? "Story Bible" : undefined}
              >
                <BookMarked className="size-4 shrink-0" />
                {!compact ? <span className="flex-1">Story Bible</span> : null}
                {!compact ? storyBibleOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : null}
              </button>
              {storyBibleOpen ? (
                <div id="story-bible-navigation" role="group" aria-label="Story Bible destinations" className="mt-1 grid gap-1.5 border-l border-border/60 pl-3">
                  {renderItems(storyBiblePages)}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="mt-4" aria-label="Utilities">
            {!compact ? <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Utilities</p> : null}
            <div className="grid gap-1.5">{renderItems(utilityPages)}</div>
          </section>
        </nav>

        <div className="border-t border-border/55 p-3">
          <div className="grid gap-2.5">
            {renderItems(["settings"])}
            <div className={cn("grid gap-2.5 border-t border-border/55 pt-2.5", compact && "justify-items-center")}>
              <ToolbarIconButton label={copy.expandedSidebar} active={!compact} onClick={() => onSidebarStateChange("expanded")}>
                <PanelLeftOpen className="size-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label={copy.compactSidebar} active={compact} onClick={() => onSidebarStateChange("compact")}>
                <ChevronsLeft className="size-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label={copy.hideSidebar} onClick={() => onSidebarStateChange("hidden")}>
                <PanelLeftClose className="size-4" />
              </ToolbarIconButton>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
