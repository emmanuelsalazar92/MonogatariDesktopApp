"use client";

import {
  BookOpen,
  ChevronsRight,
  Columns3,
  Menu
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToolbarIconButton } from "@/components/studio/shared";
import { type Novel, type SidebarState } from "@/lib/studio-domain";

type TopBarCopy = {
  openNavigation: string;
  toggleSidebar: string;
  currentNovel: string;
};

export function TopBar({
  pageLabel,
  sidebarState,
  mobileNavigationOpen,
  novels,
  activeNovelId,
  copy,
  showNovelSelector = true,
  readerOptimized = false,
  onOpenMobileNav,
  onCycleSidebar,
  onActiveNovelChange
}: {
  pageLabel: string;
  sidebarState: SidebarState;
  mobileNavigationOpen: boolean;
  novels: Novel[];
  activeNovelId: string;
  copy: TopBarCopy;
  showNovelSelector?: boolean;
  readerOptimized?: boolean;
  onOpenMobileNav: () => void;
  onCycleSidebar: () => void;
  onActiveNovelChange: (novelId: string) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/82 backdrop-blur-xl">
      <div className="flex min-h-[4.5rem] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className={readerOptimized ? "lg:hidden" : "md:hidden"}>
          <ToolbarIconButton
            id="mobile-navigation-toggle"
            label={copy.openNavigation}
            expanded={mobileNavigationOpen}
            onClick={onOpenMobileNav}
          >
            <Menu className="size-5" />
          </ToolbarIconButton>
        </div>
        <div className={readerOptimized ? "hidden lg:block" : "hidden md:block"}>
          <ToolbarIconButton
            label={copy.toggleSidebar}
            onClick={onCycleSidebar}
            active={sidebarState !== "hidden"}
          >
            {sidebarState === "hidden" ? (
              <ChevronsRight className="size-5" />
            ) : (
              <Columns3 className="size-5" />
            )}
          </ToolbarIconButton>
        </div>

        <Separator orientation="vertical" className="hidden h-7 sm:block" />

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[13px]">
            {pageLabel}
          </h2>
        </div>

        {showNovelSelector && novels.length ? (
          <Select value={activeNovelId} onValueChange={onActiveNovelChange}>
            <SelectTrigger aria-label={copy.currentNovel} className="h-10 min-w-0 basis-full sm:basis-auto sm:w-64 sm:max-w-[45%] [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left [&>svg]:shrink-0">
              <BookOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {novels.map((novel) => (
                <SelectItem key={novel.id} value={novel.id} className="[overflow-wrap:anywhere]">
                  {novel.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

      </div>
    </header>
  );
}
