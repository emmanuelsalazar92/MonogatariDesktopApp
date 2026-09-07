"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Novel } from "@/lib/studio-domain";
import type { NovelMetadataFieldErrors, NovelMetadataInput } from "@/lib/novel-metadata";

export function NovelDetailsDialog({
  open,
  novel,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  novel: Novel;
  onOpenChange: (open: boolean) => void;
  onSaved: (input: NovelMetadataInput) => Promise<void>;
}) {
  const [form, setForm] = React.useState<NovelMetadataInput>({ title: "", synopsis: "", genre: "", tags: [] });
  const [tagsText, setTagsText] = React.useState("");
  const [errors, setErrors] = React.useState<NovelMetadataFieldErrors>({});
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ title: novel.title, synopsis: novel.synopsis, genre: novel.genre, tags: novel.tags });
    setTagsText(novel.tags.join(", "));
    setErrors({});
    setError("");
    setSaving(false);
  }, [novel, open]);

  const update = (field: Exclude<keyof NovelMetadataInput, "tags">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setErrors({});
    const input = { ...form, tags: tagsText.split(/[\n,]/) };
    try {
      await onSaved(input);
      onOpenChange(false);
    } catch (caught) {
      const details = caught as Error & { fieldErrors?: NovelMetadataFieldErrors };
      setErrors(details.fieldErrors ?? {});
      setError(details.message || "Could not save novel details.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Update the editorial identity for this novel. Chapters and scenes are unchanged.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <TextField id="novel-title" label="Title" value={form.title} error={errors.title} required maxLength={160} onChange={(value) => update("title", value)} />
          <TextField id="novel-genre" label="Genre" value={form.genre} error={errors.genre} maxLength={120} onChange={(value) => update("genre", value)} />
          <div className="grid gap-2">
            <Label htmlFor="novel-tags">Tags</Label>
            <Input id="novel-tags" value={tagsText} maxLength={1_220} aria-invalid={Boolean(errors.tags)} aria-describedby="novel-tags-help novel-tags-error" placeholder="Fantasy, mystery, school" onChange={(event) => { setTagsText(event.target.value); setErrors((current) => ({ ...current, tags: undefined })); }} />
            <p id="novel-tags-help" className="text-xs text-muted-foreground">Separate tags with commas or new lines. They are stored as plain text.</p>
            <FieldError id="novel-tags-error" message={errors.tags} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="novel-synopsis">Synopsis</Label>
            <Textarea id="novel-synopsis" value={form.synopsis} maxLength={5_000} aria-invalid={Boolean(errors.synopsis)} aria-describedby="novel-synopsis-error" onChange={(event) => update("synopsis", event.target.value)} />
            <FieldError id="novel-synopsis-error" message={errors.synopsis} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ id, label, value, error, onChange, ...props }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  const errorId = `${id}-error`;
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} {...props} /><FieldError id={errorId} message={error} /></div>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null;
}
