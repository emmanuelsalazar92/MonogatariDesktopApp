"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { createEventSaveLock } from "@/lib/timeline-event";
import { timelineCatalogRoute, type TimelineCatalogState } from "@/lib/timeline-catalog";
import type { TimelineEvent } from "@/lib/studio-domain";
import type { TimelineAction, TimelineImpact } from "@/lib/timeline-lifecycle";

export function TimelineLifecycle({ event, catalog, onChanged }: { event: TimelineEvent; catalog: TimelineCatalogState; onChanged: () => Promise<void> }) {
  const router = useRouter(), lock = React.useMemo(createEventSaveLock, []);
  const [action, setAction] = React.useState<TimelineAction | null>(null), [impact, setImpact] = React.useState<TimelineImpact | null>(null);
  const [pending, setPending] = React.useState(false), [committed, setCommitted] = React.useState(false), [error, setError] = React.useState("");
  const invoker = React.useRef<HTMLButtonElement | null>(null), request = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => request.current?.abort(), []);
  const url = `/api/timeline-events/${encodeURIComponent(event.id)}/lifecycle?novelId=${encodeURIComponent(event.novelId)}&spoilers=${catalog.spoilers}`;
  const load = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setImpact(null); setError("");
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Could not load impact. Reload and try again.");
      const result = await response.json();
      if (!controller.signal.aborted) setImpact(result);
    } catch { if (!controller.signal.aborted) setError("Could not load impact. Close and try again."); }
  };
  const open = (next: TimelineAction, button: HTMLButtonElement) => { invoker.current = button; setAction(next); setCommitted(false); void load(); };
  const close = () => { if (!lock.busy) { request.current?.abort(); setAction(null); } };
  const finish = async (source: string) => {
    await onChanged();
    if (window.location.href === source) router.replace(timelineCatalogRoute(event.novelId, { ...catalog, archived: false }), { scroll: false });
  };
  const run = async () => {
    if (!impact || !action || (action === "delete" && impact.notes > 0) || !lock.acquire()) return;
    const source = window.location.href;
    setPending(true); setError("");
    try {
      if (!committed) {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, confirmed: true, revision: impact.revision, token: impact.token }) });
        if (!response.ok) { setImpact(null); throw new Error("Event changed or could not be saved. Reload impact and confirm again."); }
        setCommitted(true);
      }
      await finish(source); setAction(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh Timeline"); }
    finally { lock.release(); setPending(false); }
  };
  return <>
    <div className="flex flex-wrap gap-2" aria-label="Event lifecycle">
      <Button variant="outline" onClick={e => open(event.archivedAt ? "restore" : "archive", e.currentTarget)}>{event.archivedAt ? "Restore Event" : "Archive Event"}</Button>
      <Button variant="outline" onClick={e => open("delete", e.currentTarget)}>Delete Event…</Button>
    </div>
    <Dialog open={action !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="relationship-dialog" closeDisabled={pending} onCloseAutoFocus={e => { e.preventDefault(); invoker.current?.focus(); }} onEscapeKeyDown={e => { if (lock.busy) e.preventDefault(); }} onInteractOutside={e => { if (lock.busy) e.preventDefault(); }}>
        <DialogHeader className="relationship-dialog-header"><DialogTitle>{action === "delete" ? "Delete Event permanently" : action === "restore" ? "Restore Event" : "Archive Event"}</DialogTitle><DialogDescription>Archive is recoverable and preserves all associations. Delete removes only this event and its joins, never Characters, Places or Structure.</DialogDescription></DialogHeader>
        <div className="relationship-dialog-body">
          {impact ? <dl className="grid grid-cols-2 gap-2"><dt>Characters</dt><dd>{impact.characters}</dd><dt>Places</dt><dd>{impact.places}</dd><dt>Structure links</dt><dd>{impact.structure}</dd><dt>Description</dt><dd>{impact.hasDescription ? "Present" : "Empty"}</dd></dl> : !error ? <p role="status">Loading current impact…</p> : null}
          {impact?.notes ? <p role="status">Referenced by {impact.notes} Notes. Archive this event or unlink those Notes before deleting.</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {error && !committed ? <Button disabled={pending} onClick={() => void load()}>Reload impact</Button> : null}
          {pending ? <p role="status">Saving…</p> : null}
        </div>
        <DialogFooter className="relationship-dialog-footer"><Button variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button variant={action === "delete" ? "destructive" : "default"} disabled={!impact || pending || (action === "delete" && impact.notes > 0)} onClick={() => void run()}>{committed ? "Retry refresh" : action === "delete" ? "Confirm permanent delete" : "Confirm"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
