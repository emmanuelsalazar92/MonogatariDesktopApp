"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { characterStatuses, type CharacterFieldErrors, type CharacterMetadataInput } from "@/lib/character-metadata";
import type { Character } from "@/lib/studio-domain";

const emptyForm: CharacterMetadataInput = {
  name: "", aliases: [], role: "", status: "Active", age: "", appearance: "", personality: "",
  wayOfSpeaking: "", goal: "", fear: "", secret: "", notes: ""
};

export function CharacterFormDialog({ open, novelId, character, onOpenChange, onSaved }: {
  open: boolean;
  novelId: string;
  character: Character | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (character: Character, mode: "create" | "edit") => Promise<void>;
}) {
  const mode = character ? "edit" : "create";
  const [form, setForm] = React.useState<CharacterMetadataInput>(emptyForm);
  const [aliasesText, setAliasesText] = React.useState("");
  const [errors, setErrors] = React.useState<CharacterFieldErrors>({});
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(character ? {
      name: character.name, aliases: character.aliases, role: character.role, status: character.status,
      age: character.age, appearance: character.appearance, personality: character.personality,
      wayOfSpeaking: character.wayOfSpeaking, goal: character.goal, fear: character.fear,
      secret: character.secret, notes: character.notes
    } : emptyForm);
    setAliasesText(character?.aliases.join("\n") ?? "");
    setErrors({}); setError(""); setSaving(false);
  }, [character, open]);

  const update = (field: keyof CharacterMetadataInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setErrors({});
    const payload = { ...form, aliases: aliasesText.split(/[\n,]/) };
    try {
      const response = await fetch(character ? `/api/characters/${encodeURIComponent(character.id)}` : "/api/characters", {
        method: character ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(character ? payload : { ...payload, novelId })
      });
      const result = await response.json().catch(() => null) as (Character & { error?: string; fieldErrors?: CharacterFieldErrors }) | null;
      if (!response.ok || !result) {
        setErrors(result?.fieldErrors ?? {});
        throw new Error(result?.error ?? `Character save failed with ${response.status}`);
      }
      await onSaved(result, mode);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save character.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit character" : "Add character"}</DialogTitle>
          <DialogDescription>Maintain narrative metadata. Story links and first appearance are managed elsewhere.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="character-name" label="Name" value={form.name} error={errors.name} required maxLength={120} onChange={(value) => update("name", value)} />
            <TextField id="character-age" label="Age" value={form.age} error={errors.age} maxLength={80} onChange={(value) => update("age", value)} />
            <TextField id="character-role" label="Role" value={form.role} error={errors.role} maxLength={80} onChange={(value) => update("role", value)} />
            <div className="grid gap-2">
              <Label htmlFor="character-status">Status</Label>
              <Select value={form.status} onValueChange={(value) => update("status", value)}>
                <SelectTrigger id="character-status" aria-invalid={Boolean(errors.status)}><SelectValue /></SelectTrigger>
                <SelectContent>{characterStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <FieldError message={errors.status} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="character-aliases">Aliases</Label>
            <Textarea id="character-aliases" value={aliasesText} onChange={(event) => { setAliasesText(event.target.value); setErrors((current) => ({ ...current, aliases: undefined })); }} placeholder="One alias per line or separated by commas" aria-invalid={Boolean(errors.aliases)} />
            <p className="text-xs text-muted-foreground">Duplicates and the character name are removed automatically.</p>
            <FieldError message={errors.aliases} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LongField id="character-appearance" label="Appearance" value={form.appearance} error={errors.appearance} onChange={(value) => update("appearance", value)} />
            <LongField id="character-personality" label="Personality" value={form.personality} error={errors.personality} onChange={(value) => update("personality", value)} />
            <LongField id="character-voice" label="Way of speaking" value={form.wayOfSpeaking} error={errors.wayOfSpeaking} onChange={(value) => update("wayOfSpeaking", value)} />
            <LongField id="character-goal" label="Goal" value={form.goal} error={errors.goal} onChange={(value) => update("goal", value)} />
            <LongField id="character-fear" label="Fear" value={form.fear} error={errors.fear} onChange={(value) => update("fear", value)} />
            <LongField id="character-secret" label="Secret" value={form.secret} error={errors.secret} maxLength={5000} onChange={(value) => update("secret", value)} />
          </div>
          <LongField id="character-notes" label="Notes" value={form.notes} error={errors.notes} maxLength={10000} onChange={(value) => update("notes", value)} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create character"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { message?: string }) { return message ? <p className="text-xs text-destructive">{message}</p> : null; }

function TextField({ id, label, value, error, onChange, ...props }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} {...props} /><FieldError message={error} /></div>;
}

function LongField({ id, label, value, error, onChange, maxLength = 2000 }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; maxLength?: number }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Textarea id={id} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} /><FieldError message={error} /></div>;
}
