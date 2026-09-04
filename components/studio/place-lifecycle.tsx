"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldLine } from "@/components/studio/shared";
import { routeForPlaceCatalog, type PlaceCatalogState } from "@/lib/place-catalog";
import { placeImpactKeys, type PlaceDeleteImpact } from "@/lib/place-lifecycle";
import type { Location } from "@/lib/studio-domain";

type Action = "archive" | "restore" | "delete";

export function PlaceDeleteImpactSummary({ impact }: { impact: PlaceDeleteImpact }) {
  return <>
    <div className="grid grid-cols-2 gap-3">
      <FieldLine label="Child places" value={impact.children} />
      <FieldLine label="Linked scenes" value={impact.scenes} />
      <FieldLine label="Linked characters" value={impact.characters} />
      <FieldLine label="Timeline events" value={impact.events} />
    </div>
    <p className="text-sm text-muted-foreground">Counts include archived and historical references.</p>
    {!impact.canDelete ? <p className="text-sm text-destructive">This place is referenced and cannot be permanently deleted. Archive it instead. Children will not be deleted or moved.</p>
      : <p className="text-sm text-muted-foreground">No references remain. Deleting this place permanently removes its narrative profile and cannot be undone.</p>}
  </>;
}

export function PlaceLifecycle({ place, catalogState, onChanged }: {
  place: Location; catalogState: PlaceCatalogState; onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [action, setAction] = React.useState<Action | null>(null);
  const [impact, setImpact] = React.useState<PlaceDeleteImpact | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [committed, setCommitted] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef<AbortController | null>(null);
  const invoker = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => () => request.current?.abort(), []);
  const baseUrl = `/api/places/${encodeURIComponent(place.id)}`;
  const query = `?novelId=${encodeURIComponent(place.novelId)}`;

  const loadImpact = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setImpact(null);
    try {
      const response = await fetch(`${baseUrl}/impact${query}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load place impact");
      if (!controller.signal.aborted) setImpact(payload);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load place impact");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const open = (next: Action, element: HTMLButtonElement) => {
    invoker.current = element; setAction(next); setCommitted(false); void loadImpact();
  };
  const finish = async (completed: Action) => {
    const sourceUrl = window.location.href;
    await onChanged();
    // Do not pull the author back after Back/Forward or a workspace change.
    if (window.location.href !== sourceUrl) return;
    router.replace(routeForPlaceCatalog(place.novelId, completed === "restore" ? { ...catalogState, status: "active" } : catalogState), { scroll: false });
    setAction(null);
  };
  const run = async () => {
    if (!action || !impact || pending || loading || committed || (action === "delete" && !impact.canDelete)) return;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError("");
    try {
      const response = await fetch(`${baseUrl}${action === "delete" ? "" : `/${action}`}${query}`, {
        method: action === "delete" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ confirmed: true, revision: impact.revision,
          ...(action === "delete" ? { impact: Object.fromEntries(placeImpactKeys.map((key) => [key, impact[key]])) } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) {
        setImpact(payload.impact ?? null);
        throw new Error(payload.error ?? "Could not change place lifecycle");
      }
      if (controller.signal.aborted) return;
      setCommitted(true);
      await finish(action);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not change place lifecycle");
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <>
    <div className="flex flex-wrap gap-2" aria-label="Place lifecycle">
      <Button type="button" variant="outline" size="sm" onClick={(event) => open(place.status === "archived" ? "restore" : "archive", event.currentTarget)}>{place.status === "archived" ? "Restore place" : "Archive place"}</Button>
      <Button type="button" variant="outline" size="sm" onClick={(event) => open("delete", event.currentTarget)}>Delete place…</Button>
    </div>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !pending) { request.current?.abort(); setAction(null); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]" closeDisabled={pending} onCloseAutoFocus={(event) => { event.preventDefault(); invoker.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{action === "delete" ? "Delete place permanently" : action === "restore" ? "Restore place" : "Archive place"}</DialogTitle>
          <DialogDescription>{action === "delete" ? "Review the impact before confirming. Archive is the preferred, recoverable option."
            : action === "restore" ? "Return this place to the active catalog with its profile and relationships intact."
              : "Hide this place from the active catalog. Scenes, characters, events and child places remain unchanged. You can restore it later."}</DialogDescription>
        </DialogHeader>
        <p className="break-words font-medium">{impact?.name ?? place.name}</p>
        {loading ? <p role="status">Loading current impact…</p> : null}
        {action === "delete" && impact ? <PlaceDeleteImpactSummary impact={impact} /> : null}
        {committed ? <p role="status">Change saved. Refreshing the catalog…</p> : null}
        {error ? <div className="grid gap-2"><p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" disabled={pending || loading} onClick={() => {
            if (committed && action) void finish(action).catch(() => setError("Change saved, but the catalog could not refresh. Please retry."));
            else void loadImpact();
          }}>{committed ? "Refresh catalog" : "Reload impact"}</Button>
        </div> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => { request.current?.abort(); setAction(null); }}>Cancel</Button>
          {action === "delete" && impact && !impact.canDelete && impact.status !== "archived" ? <Button type="button" disabled={pending} onClick={() => setAction("archive")}>Archive instead</Button> : null}
          <Button type="button" variant={action === "delete" ? "destructive" : "default"} disabled={!impact || loading || pending || committed || (action === "delete" && !impact.canDelete)} onClick={() => void run()}>
            {pending ? "Saving…" : action === "delete" ? "Delete permanently" : action === "restore" ? "Restore" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
