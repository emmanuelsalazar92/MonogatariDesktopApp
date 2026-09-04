"use client";
import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

export function TimelineFilters({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)"), update = () => setOpen(!media.matches);
    update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 rounded-lg border bg-card"><summary className="cursor-pointer p-4 font-medium focus-visible:ring-2">Timeline filters</summary>{children}</details>;
}

export function TimelineDetailPanel({ children, backHref }: { children: React.ReactNode; backHref: string }) {
  const [narrow, setNarrow] = React.useState(false), router = useRouter();
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)"), update = () => setNarrow(media.matches);
    update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  if (!narrow) return <div className="min-w-0">{children}</div>;
  return <Dialog open modal onOpenChange={open => { if (!open) router.push(backHref, { scroll: false }); }}>
    <DialogContent className="relationship-detail-drawer" onCloseAutoFocus={event => { event.preventDefault(); document.getElementById("timeline-results-heading")?.focus(); }}>
      <DialogHeader className="border-b p-4 pr-12"><DialogTitle>Event detail</DialogTitle><DialogDescription>Read this event or return to the chronology.</DialogDescription><Link href={backHref} className="text-primary underline focus-visible:ring-2">Back to timeline</Link></DialogHeader>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 [overflow-wrap:anywhere]">{children}</div>
    </DialogContent>
  </Dialog>;
}
