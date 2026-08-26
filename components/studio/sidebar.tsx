"use client";

import { ChevronsLeft, PanelLeftClose, PanelLeftOpen, PenLine } from "lucide-react";

import { ToolbarIconButton } from "@/components/studio/shared";
import { navigationItems, type PageId, type SidebarState } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

type SidebarCopy = {
  appSubtitle: string;
  expandedSidebar: string;
  compactSidebar: string;
  hideSidebar: string;
};

export function Sidebar({
  activePage,
  sidebarState,
  labels,
  copy,
  onSelectPage,
  onSidebarStateChange
}: {
  activePage: PageId;
  sidebarState: SidebarState;
  labels: Record<PageId, string>;
  copy: SidebarCopy;
  onSelectPage: (page: PageId) => void;
  onSidebarStateChange: (state: SidebarState) => void;
}) {
  if (sidebarState === "hidden") {
    return null;
  }

  const compact = sidebarState === "compact";

  return (
    <aside
      className={cn(
        "surface-panel sticky top-0 hidden h-screen shrink-0 border-r border-border/55 md:block",
        compact ? "w-20" : "w-72"
      )}
    >
      <div className="flex h-full flex-col">
        <div
          className={cn(
            "flex items-center gap-3 border-b border-border/55 px-4 py-4",
            compact && "justify-center"
          )}
        >
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

        <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <div className="grid gap-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPage(item.id)}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-muted-foreground transition-all duration-150 hover:bg-secondary/74 hover:text-foreground",
                    compact && "justify-center px-0",
                    active &&
                      "bg-primary text-primary-foreground shadow-paper-sm hover:bg-primary hover:text-primary-foreground"
                  )}
                  title={compact ? labels[item.id] : undefined}
                >
                  <Icon className={cn("size-4 shrink-0", !active && "text-muted-foreground/90 group-hover:text-foreground")} />
                  {!compact ? <span className="truncate">{labels[item.id]}</span> : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-border/55 p-3">
          <div className={cn("grid gap-2.5", compact && "justify-items-center")}>
            <ToolbarIconButton
              label={copy.expandedSidebar}
              active={!compact}
              onClick={() => onSidebarStateChange("expanded")}
            >
              <PanelLeftOpen className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={copy.compactSidebar}
              active={compact}
              onClick={() => onSidebarStateChange("compact")}
            >
              <ChevronsLeft className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={copy.hideSidebar}
              onClick={() => onSidebarStateChange("hidden")}
            >
              <PanelLeftClose className="size-4" />
            </ToolbarIconButton>
          </div>
        </div>
      </div>
    </aside>
  );
}
