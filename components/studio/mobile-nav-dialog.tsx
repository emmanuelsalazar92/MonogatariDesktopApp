"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { navigationItems, type PageId } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

export function MobileNavDialog({
  open,
  activePage,
  labels,
  description,
  onOpenChange,
  onSelectPage
}: {
  open: boolean;
  activePage: PageId;
  labels: Record<PageId, string>;
  description: string;
  onOpenChange: (open: boolean) => void;
  onSelectPage: (page: PageId) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 top-0 h-full w-[88vw] max-w-sm translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 sm:left-0 sm:top-0">
        <DialogHeader className="border-b border-border/55 px-5 py-4 pr-12">
          <DialogTitle>Private Novel Studio</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="hide-scrollbar overflow-y-auto px-3 py-4">
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
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-muted-foreground transition-colors hover:bg-secondary/72 hover:text-foreground",
                    active && "bg-primary text-primary-foreground shadow-paper-sm hover:bg-primary"
                  )}
                >
                  <Icon className="size-4" />
                  {labels[item.id]}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
