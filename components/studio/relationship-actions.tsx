"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { RelationshipFields, type RelationshipFormValues } from "./relationship-fields";
import { getStoredRelationshipDefinition, readRelationshipSince, validateRelationshipInput } from "@/lib/character-relationship";
import type { Relationship } from "@/lib/studio-domain";
import type { RelationshipSinceOption } from "@/lib/relationship-since";
type Action = "edit" | "archive" | "restore" | "delete";

export function RelationshipActions({ relationship, characters, sinceOptions, onChanged }: {
  relationship: Relationship; characters: { id: string; name: string }[]; sinceOptions: RelationshipSinceOption[]; onChanged: () => Promise<void>;
}) {
  const [action, setAction] = React.useState<Action | null>(null);
  const [pending, setPending] = React.useState(false);
  const [committed, setCommitted] = React.useState(false);
  const [error, setError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [form, setForm] = React.useState<RelationshipFormValues | null>(null);
  const firstField = React.useRef<HTMLButtonElement>(null);
  const invoker = React.useRef<HTMLButtonElement | null>(null);
  const fallbackFocus = React.useRef<HTMLElement | null>(null);
  const open = (next: Action, element: HTMLButtonElement) => {
    invoker.current = element; fallbackFocus.current = element.closest("section"); setError(""); setCommitted(false); setRevision(relationship.revision ?? 0);
    setForm({ fromCharacterId: relationship.fromCharacterId, toCharacterId: relationship.toCharacterId,
      relationshipType: getStoredRelationshipDefinition(relationship.relationshipType)?.key ?? "",
      status: relationship.status, description: relationship.description, notes: relationship.notes, isSpoiler: relationship.isSpoiler,
      ...(readRelationshipSince(relationship as unknown as Record<string, unknown>) ?? { sinceKind: "unknown", sinceTargetId: null, since: "" }) });
    setAction(next);
  };
  const close = () => { if (!pending) setAction(null); };
  const run = async () => {
    if (!action || pending || !form) return;
    setError("");
    if (action === "edit" && !committed) {
      const validation = validateRelationshipInput({ novelId: relationship.novelId, ...form });
      if (!validation.ok) { setError(validation.error); return; }
    }
    setPending(true);
    try {
      if (!committed) {
        const response = await fetch(`/api/relationships/${encodeURIComponent(relationship.id)}`, {
          method: action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, novelId: relationship.novelId, revision, ...(action === "edit" ? form : { confirmed: true }) })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(response.status === 409 ? "Relationship changed or is unavailable. Close and reload before trying again." : payload?.error ?? "Could not save relationship.");
        }
        setCommitted(true);
      }
      await onChanged(); setAction(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save relationship."); }
    finally { setPending(false); }
  };
  return <>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Relationship actions">
      <Button variant="outline" onClick={(e) => open("edit", e.currentTarget)}>Edit</Button>
      <Button variant="outline" onClick={(e) => open(relationship.archivedAt ? "restore" : "archive", e.currentTarget)}>{relationship.archivedAt ? "Restore" : "Archive"}</Button>
      <Button variant="ghost" className="text-destructive" onClick={(e) => open("delete", e.currentTarget)}>Delete</Button>
    </div>
    <Dialog open={Boolean(action)} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent className="relationship-dialog" closeDisabled={pending} onOpenAutoFocus={(e) => { if (action === "edit") { e.preventDefault(); firstField.current?.focus(); } }}
        onCloseAutoFocus={(e) => { e.preventDefault(); if (invoker.current?.isConnected) invoker.current.focus(); else if (fallbackFocus.current?.isConnected) fallbackFocus.current.focus(); }} onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }} onInteractOutside={(e) => { if (pending) e.preventDefault(); }}>
        <DialogHeader className="relationship-dialog-header"><DialogTitle>{action === "edit" ? "Edit relationship" : action === "delete" ? "Delete relationship?" : action === "restore" ? "Restore relationship?" : "Archive relationship?"}</DialogTitle>
          <DialogDescription>{action === "edit" ? "Save explicit changes to this relationship." : action === "delete" ? "Permanently deletes only this relationship and its notes. Characters and Structure are preserved. Archive is recoverable instead." : "Preserves characters, Structure and relationship metadata."}</DialogDescription>
        </DialogHeader>
        <div className="relationship-dialog-body">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {action === "delete" ? <dl className="grid grid-cols-2 gap-2 text-sm" aria-label="Delete impact">
            <dt>Relationships removed</dt><dd>1</dd><dt>Characters deleted</dt><dd>0</dd><dt>Structure items deleted</dt><dd>0</dd>
            <dt>Narrative context</dt><dd>Description, Notes and Since are permanently removed.</dd>
          </dl> : null}
          {action === "edit" && form ? <RelationshipFields form={form} onChange={(update) => setForm((current) => current ? typeof update === "function" ? update(current) : update : current)} characters={characters} sinceOptions={sinceOptions} saving={pending || committed} firstFieldRef={firstField} /> : null}
        </div>
        <DialogFooter className="relationship-dialog-footer">
          <Button variant="outline" disabled={pending} onClick={close}>Cancel</Button>
          <Button variant={action === "delete" ? "destructive" : "default"} disabled={pending} onClick={() => void run()}>{pending ? "Saving…" : committed ? "Retry refresh" : action === "edit" ? "Save Relationship" : action === "delete" ? "Delete relationship" : action === "restore" ? "Restore relationship" : "Archive relationship"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
