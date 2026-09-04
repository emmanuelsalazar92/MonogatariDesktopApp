"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { placeTypes, type Location, type PlaceSummary } from "@/lib/studio-domain";
import { placeTextLimits, validatePlaceMetadata, type PlaceFieldErrors, type PlaceMetadataInput } from "@/lib/place-metadata";
import { createPlaceParentValidator, MAX_PLACE_DEPTH } from "@/lib/place-hierarchy";
import { placeStatuses, placeTypeLabels, placeStatusLabels, normalizePlaceType, normalizePlaceStatus } from "@/lib/place-classification";

function metadataFor(place: Location | null): PlaceMetadataInput {
  return {
    name: place?.name ?? "", type: normalizePlaceType(place?.type), status: normalizePlaceStatus(place?.status),
    description: place?.description ?? "", visualNotes: place?.visualNotes ?? "",
    atmosphere: place?.atmosphere ?? "", rules: place?.rules ?? "", notes: place?.notes ?? "",
    parentPlaceId: place?.parentPlaceId ?? null
  };
}

export function PlaceFormDialog({ novelId, place, places, onClose, onSaved }: {
  novelId: string;
  place: Location | null;
  places: PlaceSummary[];
  onClose: () => void;
  onSaved: (place: Location) => Promise<void>;
}) {
  // Freeze the workspace and revision at opening; refreshed summaries never overwrite a draft.
  const [contextNovelId] = React.useState(novelId);
  const [invoker] = React.useState(() => typeof document !== "undefined" ? document.activeElement : null);
  const [form, setForm] = React.useState(() => metadataFor(place));
  const [revision, setRevision] = React.useState(place?.revision ?? 0);
  const [fieldErrors, setFieldErrors] = React.useState<PlaceFieldErrors>({});
  const [error, setError] = React.useState("");
  const [conflict, setConflict] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const requestRef = React.useRef<AbortController | null>(null);
  const currentNovelRef = React.useRef(novelId);
  currentNovelRef.current = novelId;
  React.useEffect(() => () => requestRef.current?.abort(), []);
  const contextChanged = contextNovelId !== novelId || Boolean(place && place.novelId !== contextNovelId);
  const parentOptions = React.useMemo(() => {
    const scoped = places.filter((candidate) => candidate.novelId === contextNovelId);
    const parentError = createPlaceParentValidator(scoped);
    return scoped.filter((candidate) => !parentError(place?.id ?? "new-place", candidate.id));
  }, [places, contextNovelId, place?.id]);

  const update = (field: keyof PlaceMetadataInput, value: string | null) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };
  const reload = async () => {
    if (!place || contextChanged || saving) return;
    setSaving(true);
    setError("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(place.id)}?novelId=${encodeURIComponent(contextNovelId)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Could not reload the place. Your draft has been kept.");
      const latest = await response.json() as Location;
      if (controller.signal.aborted || currentNovelRef.current !== contextNovelId) return;
      setForm(metadataFor(latest)); setRevision(latest.revision); setConflict(false); setFieldErrors({});
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not reload place");
    } finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || contextChanged || conflict) return;
    const validation = validatePlaceMetadata(form);
    if (!validation.ok) { setFieldErrors(validation.fieldErrors); setError(validation.error); return; }
    setSaving(true); setError(""); setFieldErrors({});
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(`/api/places${place ? `/${encodeURIComponent(place.id)}` : ""}?novelId=${encodeURIComponent(contextNovelId)}`, {
        method: place ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validation.data, novelId: contextNovelId, ...(place ? { revision } : {}) }),
        signal: controller.signal
      });
      const result = await response.json() as Location & { error?: string; code?: string; fieldErrors?: PlaceFieldErrors };
      if (!response.ok) {
        setConflict(response.status === 409 && result.code === "STALE_REVISION" && Boolean(place));
        setFieldErrors(result.fieldErrors ?? {});
        throw new Error(result.error ?? "Could not save place");
      }
      if (controller.signal.aborted || currentNovelRef.current !== contextNovelId) return;
      await onSaved(result);
      onClose();
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not save place");
    } finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const longFields = [
    ["description", "Description"], ["visualNotes", "Visual description"],
    ["atmosphere", "Atmosphere"], ["rules", "Rules / Characteristics"], ["notes", "Notes"]
  ] as const;

  return (
    <Dialog open modal onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent
        aria-modal="true"
        closeDisabled={saving}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus({ preventScroll: true });
        }}
        className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto [overflow-wrap:anywhere]"
      >
        <DialogHeader>
          <DialogTitle>{place ? "Edit place" : "Add place"}</DialogTitle>
          <DialogDescription>Only Name is required. First appearance, scene count and linked entities are derived from story links.</DialogDescription>
        </DialogHeader>
        <form className="min-w-0 space-y-4" onSubmit={submit}>
          <fieldset disabled={saving || contextChanged} className="grid min-w-0 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="place-name">Name</Label>
              <Input id="place-name" autoFocus required maxLength={placeTextLimits.name} value={form.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "place-name-error" : undefined} />
              {fieldErrors.name ? <p id="place-name-error" className="text-sm text-destructive">{fieldErrors.name}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([['type', 'Type', placeTypes], ['status', 'Status', placeStatuses]] as const).map(([field, label, options]) => (
                <div key={field} className="grid min-w-0 gap-2">
                  <Label htmlFor={`place-${field}`}>{label}</Label>
                  <Select value={form[field]} onValueChange={(value) => update(field, value)} disabled={saving || contextChanged}>
                    <SelectTrigger id={`place-${field}`} aria-invalid={Boolean(fieldErrors[field])}><SelectValue /></SelectTrigger>
                    <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{({ ...placeTypeLabels, ...placeStatusLabels })[option]}</SelectItem>)}</SelectContent>
                  </Select>
                  {fieldErrors[field] ? <p className="text-sm text-destructive">{fieldErrors[field]}</p> : null}
                </div>
              ))}
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="place-parent">Parent place</Label>
              <Select value={form.parentPlaceId ?? "none"} onValueChange={(value) => update("parentPlaceId", value === "none" ? null : value)} disabled={saving || contextChanged}>
                <SelectTrigger className="min-w-0" id="place-parent" aria-describedby="place-parent-help"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]">
                  <SelectItem value="none">None</SelectItem>
                  {form.parentPlaceId && !parentOptions.some((parent) => parent.id === form.parentPlaceId) ? <SelectItem value={form.parentPlaceId} disabled>Current parent unavailable — choose another</SelectItem> : null}
                  {parentOptions.map((parent) => <SelectItem key={parent.id} value={parent.id}>{parent.name}{parent.status === "archived" ? " (Archived)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <p id="place-parent-help" className="text-xs text-muted-foreground">Same novel only. Up to {MAX_PLACE_DEPTH} levels; self and descendant places cannot be selected.</p>
              {fieldErrors.parentPlaceId ? <p className="text-sm text-destructive">{fieldErrors.parentPlaceId}</p> : null}
            </div>
            {longFields.map(([field, label]) => (
              <div key={field} className="grid gap-2">
                <Label htmlFor={`place-${field}`}>{label}</Label>
                <Textarea id={`place-${field}`} value={form[field]} maxLength={placeTextLimits[field]} onChange={(event) => update(field, event.target.value)} aria-invalid={Boolean(fieldErrors[field])} aria-describedby={fieldErrors[field] ? `place-${field}-error` : undefined} />
                {fieldErrors[field] ? <p id={`place-${field}-error`} className="text-sm text-destructive">{fieldErrors[field]}</p> : null}
              </div>
            ))}
          </fieldset>
          {contextChanged ? <p role="alert" className="text-sm text-destructive">The active novel changed. Cancel and reopen this form in the intended novel.</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-wrap gap-2">
            {conflict ? <Button type="button" variant="outline" disabled={saving || contextChanged} onClick={() => void reload()}>Reload latest (discard draft)</Button> : null}
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || contextChanged || conflict || !form.name.trim()}>{saving ? "Saving…" : place ? "Save changes" : "Create place"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
