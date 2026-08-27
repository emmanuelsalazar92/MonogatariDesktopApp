"use client";

import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
  Workflow
} from "lucide-react";

import { SectionHeader, StatusBadge } from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StructureItemType, StructureSelection } from "@/lib/db/structure";
import { formatNumber, getCurrentNovel, type StudioData } from "@/lib/studio-data";
import type { Chapter, ChapterStatus, Scene, Volume } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

const statuses: ChapterStatus[] = ["Idea", "Draft", "Writing", "Revision", "Ready", "Final"];

type SelectedItem =
  | ({ type: "volume" } & Volume)
  | ({ type: "chapter" } & Chapter)
  | ({ type: "scene" } & Scene);

type StructureForm = {
  type: StructureItemType;
  title: string;
  summary: string;
  status: ChapterStatus;
  objective: string;
  content: string;
  locationId: string;
};

const emptyForm: StructureForm = {
  type: "volume",
  title: "",
  summary: "",
  status: "Idea",
  objective: "",
  content: "",
  locationId: ""
};

export function StructureScreen({
  data,
  translate,
  onRefresh,
  onSelectItem,
  onOpenScene,
  onNotify
}: {
  data: StudioData;
  translate: (value: string) => string;
  onRefresh: () => Promise<boolean>;
  onSelectItem: (selection: StructureSelection) => void;
  onOpenScene: (sceneId: string) => void;
  onNotify: (message: string) => void;
}) {
  const currentNovel = getCurrentNovel(data);
  const [showArchived, setShowArchived] = React.useState(false);
  const [selection, setSelection] = React.useState<StructureSelection | null>(() => {
    const type = data.settings.activeStructureType;
    const id = data.settings.activeStructureId;
    return isStructureType(type) && id ? { type, id } : null;
  });
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit" | "delete" | null>(null);
  const [form, setForm] = React.useState<StructureForm>(emptyForm);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const volumes = React.useMemo(() => [...data.volumes].sort(sortByOrder), [data.volumes]);
  const chapters = React.useMemo(() => [...data.chapters].sort(sortByOrder), [data.chapters]);
  const scenes = React.useMemo(() => [...data.scenes].sort(sortByOrder), [data.scenes]);
  const visibleVolumes = React.useMemo(
    () => volumes.filter((item) => showArchived || !item.archived),
    [showArchived, volumes]
  );
  const visibleChapters = React.useMemo(
    () => chapters.filter((item) => showArchived || !item.archived),
    [chapters, showArchived]
  );
  const visibleScenes = React.useMemo(
    () => scenes.filter((item) => showArchived || !item.archived),
    [scenes, showArchived]
  );
  const selected = getSelectedItem(selection, volumes, chapters, scenes);

  const choose = React.useCallback(
    (next: StructureSelection) => {
      setSelection(next);
      onSelectItem(next);
    },
    [onSelectItem]
  );

  React.useEffect(() => {
    if (selected && (showArchived || !selected.archived)) return;
    const first = firstSelection(visibleVolumes, visibleChapters, visibleScenes);
    if (first && (selection?.id !== first.id || selection.type !== first.type)) {
      choose(first);
    } else if (!first) {
      setSelection(null);
    }
  }, [choose, selected, selection, showArchived, visibleChapters, visibleScenes, visibleVolumes]);

  const openCreate = (type: StructureItemType) => {
    if (type !== "volume" && !resolveParentId(type, selected, volumes, chapters, currentNovel.id)) {
      onNotify(type === "chapter" ? "Create or select a volume first" : "Create or select a chapter first");
      return;
    }
    setError("");
    setForm({ ...emptyForm, type });
    setDialogMode("create");
  };

  const openEdit = () => {
    if (!selected) return;
    setError("");
    setForm({
      type: selected.type,
      title: selected.title,
      summary: selected.summary,
      status: selected.type === "volume" ? "Idea" : selected.status,
      objective: selected.type === "scene" ? selected.objective : "",
      content: selected.type === "scene" ? selected.content : "",
      locationId: selected.type === "scene" ? selected.locationId : ""
    });
    setDialogMode("edit");
  };

  const request = React.useCallback(async (method: "POST" | "PATCH" | "DELETE", body: object) => {
    const response = await fetch("/api/structure", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; selection?: StructureSelection | null }
      | null;
    if (!response.ok) throw new Error(payload?.error ?? `Structure operation failed with ${response.status}`);
    return payload;
  }, []);

  const submitForm = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = dialogMode === "create"
        ? await request("POST", {
            ...form,
            title: form.title.trim(),
            parentId: resolveParentId(form.type, selected, volumes, chapters, currentNovel.id)
          })
        : await request("PATCH", { ...form, id: selected?.id, title: form.title.trim() });
      await onRefresh();
      if (payload?.selection) choose(payload.selection);
      onNotify(dialogMode === "create" ? "Structure item created in SQLite" : "Structure item updated");
      setDialogMode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the structure item");
    } finally {
      setBusy(false);
    }
  };

  const performAction = async (
    action: "move" | "duplicate" | "archive" | "restore",
    direction?: "before" | "after"
  ) => {
    if (!selected) return;
    setBusy(true);
    const fallback = fallbackSelection(selected, volumes, chapters, scenes);
    try {
      const payload = await request("PATCH", { type: selected.type, id: selected.id, action, direction });
      await onRefresh();
      const nextSelection = action === "archive" ? fallback : payload?.selection;
      if (nextSelection) choose(nextSelection);
      onNotify(actionMessage(action));
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : "Could not update structure");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    const fallback = fallbackSelection(selected, volumes, chapters, scenes);
    try {
      await request("DELETE", { type: selected.type, id: selected.id });
      await onRefresh();
      if (fallback) choose(fallback);
      onNotify("Structure item permanently deleted");
      setDialogMode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete structure item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={translate("Structure")}
        title={translate("Story tree")}
        description={translate("Create and organize volumes, chapters, and scenes. Every change is saved to SQLite.")}
        action={
          <>
            <Button onClick={() => openCreate("volume")} disabled={!currentNovel.id}>
              <FolderPlus className="size-4" />{translate("Add volume")}
            </Button>
            <Button variant="outline" onClick={() => openCreate("chapter")}>
              <Plus className="size-4" />{translate("Add chapter")}
            </Button>
            <Button variant="outline" onClick={() => openCreate("scene")}>
              <Plus className="size-4" />{translate("Add scene")}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="surface-panel">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{currentNovel.title}</CardTitle>
                <CardDescription>{translate("Select an item to manage it")}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowArchived((value) => !value)}>
                {showArchived ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {translate(showArchived ? "Hide archived" : "Show archived")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {visibleVolumes.length ? visibleVolumes.map((volume) => {
              const volumeChapters = visibleChapters.filter((chapter) => chapter.volumeId === volume.id);
              return (
                <div key={volume.id} className={cn("rounded-xl border border-border/55 bg-surface-elevated/90 p-3 shadow-paper-sm", volume.archived && "opacity-65")}>
                  <StructureRow
                    depth={0}
                    title={volume.title}
                    subtitle={volume.summary || translate("Volume")}
                    status={volume.archived ? "Archived" : "Ready"}
                    selected={selection?.type === "volume" && selection.id === volume.id}
                    strong
                    translate={translate}
                    onSelect={() => choose({ type: "volume", id: volume.id })}
                  />
                  <div className="mt-2 space-y-2">
                    {volumeChapters.length ? volumeChapters.map((chapter) => {
                      const chapterScenes = visibleScenes.filter((scene) => scene.chapterId === chapter.id);
                      return (
                        <div key={chapter.id} className={cn(chapter.archived && "opacity-65")}>
                          <StructureRow
                            depth={1}
                            title={chapter.title}
                            subtitle={`${formatNumber(chapter.wordCount)} ${translate("words")}`}
                            status={chapter.archived ? "Archived" : chapter.status}
                            selected={selection?.type === "chapter" && selection.id === chapter.id}
                            translate={translate}
                            onSelect={() => choose({ type: "chapter", id: chapter.id })}
                          />
                          <div className="space-y-2">
                            {chapterScenes.map((scene) => (
                              <StructureRow
                                key={scene.id}
                                depth={2}
                                title={scene.title}
                                subtitle={scene.objective || `${formatNumber(scene.wordCount)} ${translate("words")}`}
                                status={scene.archived ? "Archived" : scene.status}
                                selected={selection?.type === "scene" && selection.id === scene.id}
                                translate={translate}
                                onSelect={() => choose({ type: "scene", id: scene.id })}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="ml-8 rounded-lg border border-dashed border-border/70 bg-surface/74 p-3 text-sm text-muted-foreground">
                        {translate("Empty volume. Add chapter to continue the outline.")}
                      </div>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {translate("No volumes yet. Add the first volume to begin the outline.")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="surface-panel h-fit xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle>{selected?.title ?? translate("Outline actions")}</CardTitle>
            <CardDescription>
              {selected
                ? `${translate(capitalize(selected.type))} · ${selected.archived ? translate("Archived") : translate("Active")}`
                : translate("Select a structure item")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {selected?.type === "scene" ? (
              <Button className="justify-start" disabled={busy || selected.archived} onClick={() => onOpenScene(selected.id)}>
                <PenLine className="size-4" />{translate("Open in editor")}
              </Button>
            ) : null}
            <Button variant="outline" className="justify-start" disabled={!selected || busy} onClick={openEdit}>
              <Edit3 className="size-4" />{translate("Edit metadata")}
            </Button>
            <Button variant="outline" className="justify-start" disabled={!selected || busy || selected.archived} onClick={() => void performAction("duplicate")}>
              <Copy className="size-4" />{translate("Duplicate")}
            </Button>
            <Button variant="outline" className="justify-start" disabled={!selected || busy} onClick={() => void performAction(selected?.archived ? "restore" : "archive")}>
              {selected?.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {translate(selected?.archived ? "Restore" : "Archive")}
            </Button>
            <Button variant="outline" className="justify-start" disabled={!selected || busy} onClick={() => void performAction("move", "before")}>
              <ChevronUpIcon />{translate("Move before")}
            </Button>
            <Button variant="outline" className="justify-start" disabled={!selected || busy} onClick={() => void performAction("move", "after")}>
              <ChevronDown className="size-4" />{translate("Move after")}
            </Button>
            <Button variant="outline" className="justify-start text-destructive hover:text-destructive" disabled={!selected || busy} onClick={() => { setError(""); setDialogMode("delete"); }}>
              <Trash2 className="size-4" />{translate("Delete")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogMode === "create" || dialogMode === "edit"} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? translate(`Add ${form.type}`) : translate(`Edit ${form.type}`)}</DialogTitle>
            <DialogDescription>{translate("Changes are persisted immediately to the local SQLite database.")}</DialogDescription>
          </DialogHeader>
          <StructureFields form={form} locations={data.locations} onChange={setForm} />
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={busy}>{translate("Cancel")}</Button>
            <Button onClick={() => void submitForm()} disabled={busy}>{busy ? translate("Saving...") : translate("Save item")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "delete"} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Delete permanently?")}</DialogTitle>
            <DialogDescription>{deleteDescription(selected)}</DialogDescription>
          </DialogHeader>
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={busy}>{translate("Cancel")}</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>{busy ? translate("Deleting...") : translate("Delete permanently")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StructureFields({
  form,
  locations,
  onChange
}: {
  form: StructureForm;
  locations: StudioData["locations"];
  onChange: React.Dispatch<React.SetStateAction<StructureForm>>;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="structure-title">Title</Label>
        <Input id="structure-title" className="mt-2" value={form.title} autoFocus onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))} />
      </div>
      <div>
        <Label htmlFor="structure-summary">Summary</Label>
        <Textarea id="structure-summary" className="mt-2" value={form.summary} onChange={(event) => onChange((current) => ({ ...current, summary: event.target.value }))} />
      </div>
      {form.type !== "volume" ? (
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(status) => onChange((current) => ({ ...current, status: status as ChapterStatus }))}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : null}
      {form.type === "scene" ? (
        <>
          <div>
            <Label htmlFor="structure-objective">Objective</Label>
            <Input id="structure-objective" className="mt-2" value={form.objective} onChange={(event) => onChange((current) => ({ ...current, objective: event.target.value }))} />
          </div>
          <div>
            <Label>Location</Label>
            <Select value={form.locationId || "none"} onValueChange={(locationId) => onChange((current) => ({ ...current, locationId: locationId === "none" ? "" : locationId }))}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="structure-content">Scene content</Label>
            <Textarea id="structure-content" className="mt-2 min-h-40" value={form.content} onChange={(event) => onChange((current) => ({ ...current, content: event.target.value }))} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function StructureRow({
  depth,
  title,
  subtitle,
  status,
  selected,
  strong = false,
  translate,
  onSelect
}: {
  depth: number;
  title: string;
  subtitle: string;
  status: ChapterStatus;
  selected: boolean;
  strong?: boolean;
  translate: (value: string) => string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-[calc(100%-var(--structure-indent))] grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg bg-card/82 p-3 text-left shadow-soft ring-1 ring-border/55 transition-colors hover:bg-secondary/35",
        selected && "bg-secondary/55 ring-2 ring-primary/55"
      )}
      style={{ marginLeft: `${depth * 1.5}rem`, "--structure-indent": `${depth * 1.5}rem` } as React.CSSProperties}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="grid size-8 place-items-center rounded-md border border-border/60 bg-surface text-muted-foreground"><Workflow className="size-4" /></span>
      <span className="min-w-0">
        <span className={cn("block truncate text-[14px]", strong && "font-semibold")}>{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <StatusBadge status={status} translate={translate} />
      <span className="grid size-8 place-items-center text-muted-foreground" aria-hidden="true"><MoreHorizontal className="size-4" /></span>
    </button>
  );
}

function ChevronUpIcon() {
  return <ChevronLeft className="size-4 -rotate-90" />;
}

function sortByOrder(left: { sortOrder: number; id: string }, right: { sortOrder: number; id: string }) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function isStructureType(value: string | undefined): value is StructureItemType {
  return value === "volume" || value === "chapter" || value === "scene";
}

function getSelectedItem(
  selection: StructureSelection | null,
  volumes: Volume[],
  chapters: Chapter[],
  scenes: Scene[]
): SelectedItem | null {
  if (!selection) return null;
  if (selection.type === "volume") {
    const item = volumes.find((volume) => volume.id === selection.id);
    return item ? { type: "volume", ...item } : null;
  }
  if (selection.type === "chapter") {
    const item = chapters.find((chapter) => chapter.id === selection.id);
    return item ? { type: "chapter", ...item } : null;
  }
  const item = scenes.find((scene) => scene.id === selection.id);
  return item ? { type: "scene", ...item } : null;
}

function firstSelection(volumes: Volume[], chapters: Chapter[], scenes: Scene[]): StructureSelection | null {
  const firstVolume = volumes[0];
  if (!firstVolume) return null;
  const firstChapter = chapters.find((chapter) => chapter.volumeId === firstVolume.id);
  const firstScene = firstChapter ? scenes.find((scene) => scene.chapterId === firstChapter.id) : undefined;
  if (firstScene) return { type: "scene", id: firstScene.id };
  if (firstChapter) return { type: "chapter", id: firstChapter.id };
  return { type: "volume", id: firstVolume.id };
}

function resolveParentId(
  type: StructureItemType,
  selected: SelectedItem | null,
  volumes: Volume[],
  chapters: Chapter[],
  novelId: string
) {
  if (type === "volume") return novelId;
  if (type === "chapter") {
    if (selected?.type === "volume" && !selected.archived) return selected.id;
    if (selected?.type === "chapter") {
      return volumes.find((volume) => volume.id === selected.volumeId && !volume.archived)?.id ?? "";
    }
    if (selected?.type === "scene") {
      const volumeId = chapters.find((chapter) => chapter.id === selected.chapterId)?.volumeId;
      return volumes.find((volume) => volume.id === volumeId && !volume.archived)?.id ?? "";
    }
    return volumes.find((volume) => !volume.archived)?.id ?? "";
  }
  if (selected?.type === "scene") {
    return chapters.find((chapter) => chapter.id === selected.chapterId && !chapter.archived)?.id ?? "";
  }
  if (selected?.type === "chapter" && !selected.archived) return selected.id;
  if (selected?.type === "volume" && !selected.archived) return chapters.find((chapter) => chapter.volumeId === selected.id && !chapter.archived)?.id ?? "";
  return chapters.find((chapter) => !chapter.archived)?.id ?? "";
}

function fallbackSelection(
  selected: SelectedItem,
  volumes: Volume[],
  chapters: Chapter[],
  scenes: Scene[]
): StructureSelection | null {
  if (selected.type === "scene") {
    const siblings = scenes.filter((scene) => scene.chapterId === selected.chapterId && !scene.archived);
    const index = siblings.findIndex((scene) => scene.id === selected.id);
    const sibling = siblings[index + 1] ?? siblings[index - 1];
    return sibling ? { type: "scene", id: sibling.id } : { type: "chapter", id: selected.chapterId };
  }
  if (selected.type === "chapter") {
    const siblings = chapters.filter((chapter) => chapter.volumeId === selected.volumeId && !chapter.archived);
    const index = siblings.findIndex((chapter) => chapter.id === selected.id);
    const sibling = siblings[index + 1] ?? siblings[index - 1];
    return sibling ? { type: "chapter", id: sibling.id } : { type: "volume", id: selected.volumeId };
  }
  const siblings = volumes.filter((volume) => !volume.archived);
  const index = siblings.findIndex((volume) => volume.id === selected.id);
  const sibling = siblings[index + 1] ?? siblings[index - 1];
  return sibling ? { type: "volume", id: sibling.id } : null;
}

function actionMessage(action: "move" | "duplicate" | "archive" | "restore") {
  if (action === "move") return "Structure order saved to SQLite";
  if (action === "duplicate") return "Independent copy created";
  if (action === "archive") return "Structure item archived";
  return "Structure item restored";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function deleteDescription(selected: SelectedItem | null) {
  if (!selected) return "This action cannot be undone.";
  if (selected.type === "volume") return `“${selected.title}” and all of its chapters and scenes will be deleted. Linked timeline references are cleared and attached notes are removed.`;
  if (selected.type === "chapter") return `“${selected.title}” and all of its scenes will be deleted. Linked timeline references are cleared and attached notes are removed.`;
  return `“${selected.title}” will be deleted. Linked timeline references are cleared and attached notes are removed.`;
}
