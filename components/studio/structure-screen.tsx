"use client";

import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Move,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
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
import { narrativeStatuses, type Chapter, type ChapterStatus, type Scene, type Volume } from "@/lib/studio-domain";
import { getStructureAncestorIds } from "@/lib/structure-tree";
import { type StructureMovePosition } from "@/lib/structure-move";
import { searchStructureTitles, type StructureTitleSearchItem } from "@/lib/structure-search";
import { getStructureDeleteImpact, type StructureDeleteImpact } from "@/lib/structure-impact";
import { getVisibleStructureItems } from "@/lib/structure-visibility";
import { cn } from "@/lib/utils";

const statuses = narrativeStatuses;
const maxSearchQueryLength = 160;

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

type StructureCreateParent = {
  type: "novel" | "volume" | "chapter";
  id: string;
  title: string;
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
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit" | "move" | "delete" | null>(null);
  const [form, setForm] = React.useState<StructureForm>(emptyForm);
  const [createParent, setCreateParent] = React.useState<StructureCreateParent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [expandedVolumeIds, setExpandedVolumeIds] = React.useState<Set<string>>(() => new Set());
  const [expandedChapterIds, setExpandedChapterIds] = React.useState<Set<string>>(() => new Set());
  const [draggedItem, setDraggedItem] = React.useState<StructureSelection | null>(null);
  const [dropPreview, setDropPreview] = React.useState<{ id: string; position: StructureMovePosition } | null>(null);
  const [moveParentId, setMoveParentId] = React.useState("");
  const [movePosition, setMovePosition] = React.useState<StructureMovePosition>("end");
  const [moveReferenceId, setMoveReferenceId] = React.useState("");
  const [moveAnnouncement, setMoveAnnouncement] = React.useState("");
  const [structureSearch, setStructureSearch] = React.useState("");
  const [searchAnnouncement, setSearchAnnouncement] = React.useState("");
  const structureNodeButtons = React.useRef(new Map<string, HTMLButtonElement>());

  const volumes = React.useMemo(() => [...data.volumes].sort(sortByOrder), [data.volumes]);
  const chapters = React.useMemo(() => [...data.chapters].sort(sortByOrder), [data.chapters]);
  const scenes = React.useMemo(() => [...data.scenes].sort(sortByOrder), [data.scenes]);
  const visibleStructure = React.useMemo(
    () => getVisibleStructureItems(volumes, chapters, scenes, showArchived),
    [chapters, scenes, showArchived, volumes]
  );
  const { volumes: visibleVolumes, chapters: visibleChapters, scenes: visibleScenes } = visibleStructure;
  const chaptersByVolume = React.useMemo(
    () => groupByParentId(visibleChapters, "volumeId"),
    [visibleChapters]
  );
  const scenesByChapter = React.useMemo(
    () => groupByParentId(visibleScenes, "chapterId"),
    [visibleScenes]
  );
  const selected = getSelectedItem(selection, volumes, chapters, scenes);
  const deleteImpact = React.useMemo(
    () => selected ? getStructureDeleteImpact(selected.type, selected.id, volumes, chapters, scenes) : null,
    [chapters, scenes, selected, volumes]
  );
  const structureSearchResults = React.useMemo(() => {
    const items: StructureTitleSearchItem[] = [
      ...visibleVolumes.map((item) => ({ type: "volume" as const, id: item.id, title: item.title })),
      ...visibleChapters.map((item) => ({ type: "chapter" as const, id: item.id, title: item.title })),
      ...visibleScenes.map((item) => ({ type: "scene" as const, id: item.id, title: item.title }))
    ];
    return searchStructureTitles(items, structureSearch);
  }, [structureSearch, visibleChapters, visibleScenes, visibleVolumes]);
  const moveParentOptions = React.useMemo(() => {
    if (!selected) return [];
    if (selected.type === "volume") return currentNovel.id ? [{ id: currentNovel.id, title: currentNovel.title }] : [];
    if (selected.type === "chapter") return visibleVolumes.filter((volume) => !volume.archived).map((volume) => ({ id: volume.id, title: volume.title }));
    return visibleChapters.filter((chapter) => !chapter.archived).map((chapter) => ({ id: chapter.id, title: chapter.title }));
  }, [currentNovel.id, currentNovel.title, selected, visibleChapters, visibleVolumes]);
  const moveReferenceOptions = React.useMemo(() => {
    if (!selected || !moveParentId) return [];
    if (selected.type === "volume") return visibleVolumes.filter((volume) => volume.id !== selected.id);
    if (selected.type === "chapter") return (chaptersByVolume.get(moveParentId) ?? []).filter((chapter) => chapter.id !== selected.id);
    return (scenesByChapter.get(moveParentId) ?? []).filter((scene) => scene.id !== selected.id);
  }, [chaptersByVolume, moveParentId, scenesByChapter, selected, visibleVolumes]);

  const revealSelection = React.useCallback((next: StructureSelection) => {
    const ancestors = getStructureAncestorIds(next, volumes, chapters, scenes);
    if (!ancestors) return;

    setExpandedVolumeIds((current) => {
      if (current.has(ancestors.volumeId)) return current;
      return new Set(current).add(ancestors.volumeId);
    });
    if (ancestors.chapterId) {
      setExpandedChapterIds((current) => {
        if (current.has(ancestors.chapterId!)) return current;
        return new Set(current).add(ancestors.chapterId!);
      });
    }
  }, [chapters, scenes, volumes]);

  const choose = React.useCallback(
    (next: StructureSelection) => {
      setSelection(next);
      revealSelection(next);
      onSelectItem(next);
    },
    [onSelectItem, revealSelection]
  );

  const registerStructureNode = React.useCallback((item: StructureSelection, node: HTMLButtonElement | null) => {
    const key = `${item.type}:${item.id}`;
    if (node) structureNodeButtons.current.set(key, node);
    else structureNodeButtons.current.delete(key);
  }, []);

  const selectSearchResult = React.useCallback((result: StructureTitleSearchItem) => {
    choose({ type: result.type, id: result.id });
    setSearchAnnouncement(`${result.title} selected`);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const node = structureNodeButtons.current.get(`${result.type}:${result.id}`);
        node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        node?.focus({ preventScroll: true });
      });
    });
  }, [choose]);

  React.useEffect(() => {
    const type = data.settings.activeStructureType;
    const id = data.settings.activeStructureId;
    if (!isStructureType(type) || !id) return;
    if (!getSelectedItem({ type, id }, volumes, chapters, scenes)) {
      setSelection(null);
      return;
    }
    if (selection?.type === type && selection.id === id) return;
    setSelection({ type, id });
  }, [chapters, data.settings.activeStructureId, data.settings.activeStructureType, scenes, selection?.id, selection?.type, volumes]);

  React.useEffect(() => {
    if (selection) revealSelection(selection);
  }, [revealSelection, selection]);

  React.useEffect(() => {
    setStructureSearch("");
    setSearchAnnouncement("");
  }, [currentNovel.id]);

  React.useEffect(() => {
    if (selected && (showArchived || !selected.archived)) return;
    const first = firstSelection(visibleVolumes);
    if (first && (selection?.id !== first.id || selection.type !== first.type)) {
      choose(first);
    } else if (!first) {
      setSelection(null);
    }
  }, [choose, selected, selection, showArchived, visibleChapters, visibleScenes, visibleVolumes]);

  React.useEffect(() => {
    if (!draggedItem) return;
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraggedItem(null);
        setDropPreview(null);
        setMoveAnnouncement("Move cancelled");
      }
    };
    window.addEventListener("keydown", cancelDrag);
    return () => window.removeEventListener("keydown", cancelDrag);
  }, [draggedItem]);

  const expandAll = () => {
    setExpandedVolumeIds(new Set(visibleVolumes.map((volume) => volume.id)));
    setExpandedChapterIds(new Set(visibleChapters.map((chapter) => chapter.id)));
  };

  const collapseAll = () => {
    setExpandedVolumeIds(new Set());
    setExpandedChapterIds(new Set());
  };

  const openCreate = (type: StructureItemType, parent?: StructureCreateParent) => {
    const expectedParentType = type === "volume" ? "novel" : type === "chapter" ? "volume" : "chapter";
    const destination = type === "volume"
      ? { type: "novel" as const, id: currentNovel.id, title: currentNovel.title }
      : parent;
    if (!destination?.id || destination.type !== expectedParentType) {
      onNotify(type === "chapter" ? "Choose a volume before adding a chapter" : "Choose a chapter before adding a scene");
      return;
    }
    setError("");
    setCreateParent(destination);
    setForm({ ...emptyForm, type });
    setDialogMode("create");
  };

  const openEdit = () => {
    if (!selected) return;
    setError("");
    setCreateParent(null);
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

  const requestMove = React.useCallback(async (
    source: StructureSelection,
    destinationParentId: string,
    position: StructureMovePosition,
    referenceId?: string
  ) => {
    if (busy || !destinationParentId) return;
    setBusy(true);
    setDropPreview(null);
    try {
      const payload = await request("PATCH", {
        type: source.type,
        id: source.id,
        action: "move",
        destinationParentId,
        position,
        ...(referenceId ? { referenceId } : {})
      });
      await onRefresh();
      if (payload?.selection) choose(payload.selection);
      setMoveAnnouncement("Structure item moved and saved to SQLite");
      onNotify("Structure item moved and saved to SQLite");
      setDialogMode(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not move the structure item";
      setMoveAnnouncement(message);
      onNotify(message);
    } finally {
      setBusy(false);
      setDraggedItem(null);
    }
  }, [busy, choose, onNotify, onRefresh, request]);

  const openMove = () => {
    if (!selected) return;
    const currentParentId = selected.type === "volume"
      ? currentNovel.id
      : selected.type === "chapter"
        ? selected.volumeId
        : selected.chapterId;
    setMoveParentId(currentParentId);
    setMovePosition("end");
    setMoveReferenceId("");
    setError("");
    setDialogMode("move");
  };

  const submitMove = () => {
    if (!selected) return;
    if ((movePosition === "before" || movePosition === "after") && !moveReferenceId) {
      setError("Choose the item used as the move reference");
      return;
    }
    void requestMove(selected, moveParentId, movePosition, moveReferenceId || undefined);
  };

  const submitForm = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (dialogMode === "create" && !createParent?.id) {
      setError("Choose a destination before creating this item");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = dialogMode === "create"
        ? await request("POST", {
            ...form,
            title: form.title.trim(),
            novelId: currentNovel.id,
            parentId: createParent?.id
          })
        : await request("PATCH", { ...form, id: selected?.id, title: form.title.trim() });
      await onRefresh();
      if (payload?.selection) choose(payload.selection);
      onNotify(dialogMode === "create" ? "Structure item created in SQLite" : "Structure item updated");
      setDialogMode(null);
      setCreateParent(null);
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
              <Button variant="outline" size="sm" onClick={expandAll} disabled={!visibleVolumes.length}>
                <ChevronsDown className="size-4" />{translate("Expand all")}
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} disabled={!expandedVolumeIds.size && !expandedChapterIds.size}>
                <ChevronsUp className="size-4" />{translate("Collapse all")}
              </Button>
            </div>
            <div className="relative mt-4">
              <Label htmlFor="structure-title-search" className="sr-only">{translate("Search structure titles")}</Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="structure-title-search"
                type="search"
                value={structureSearch}
                maxLength={maxSearchQueryLength}
                className="pl-9"
                placeholder={translate("Search volume, chapter, or scene")}
                onChange={(event) => setStructureSearch(event.target.value.slice(0, maxSearchQueryLength))}
                aria-describedby="structure-search-status"
              />
            </div>
            {structureSearch.trim() ? (
              <div className="mt-3 rounded-lg border border-border/65 bg-surface/65 p-2">
                {structureSearchResults.length ? (
                  <div className="grid gap-1" role="listbox" aria-label={translate("Structure search results")}>
                    {structureSearchResults.map((result) => (
                      <button
                        key={`${result.type}:${result.id}`}
                        type="button"
                        role="option"
                        aria-selected={selection?.type === result.type && selection.id === result.id}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => selectSearchResult(result)}
                      >
                        <span className="truncate font-medium">{result.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{translate(capitalize(result.type))}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="px-3 py-2 text-sm text-muted-foreground" role="status">{translate("No structure items found")}</p>}
              </div>
            ) : null}
            <p id="structure-search-status" className="sr-only" role="status" aria-live="polite">
              {searchAnnouncement || (structureSearch.trim() ? `${structureSearchResults.length} structure items found` : "")}
            </p>
          </CardHeader>
          <CardContent className="space-y-5" role="tree" aria-label={translate("Story structure")}>
            {visibleVolumes.length ? visibleVolumes.map((volume) => {
              const volumeChapters = chaptersByVolume.get(volume.id) ?? [];
              const volumeSceneCount = volumeChapters.reduce(
                (total, chapter) => total + (scenesByChapter.get(chapter.id)?.length ?? 0),
                0
              );
              const volumeExpanded = expandedVolumeIds.has(volume.id);
              return (
                <div key={volume.id} className={cn("rounded-xl border border-border/55 bg-surface-elevated/90 p-3 shadow-paper-sm", volume.archived && "opacity-65")}>
                  <StructureRow
                    item={{ type: "volume", id: volume.id }}
                    depth={0}
                    title={volume.title}
                    subtitle={volumeExpanded ? volume.summary || translate("Volume") : compactCount(volumeChapters.length, "chapter", volumeSceneCount, "scene", translate)}
                    status={volume.archived ? "Archived" : undefined}
                    selected={selection?.type === "volume" && selection.id === volume.id}
                    strong
                    translate={translate}
                    nodeLabel={translate("Volume")}
                    expandable
                    expanded={volumeExpanded}
                    onToggle={() => toggleExpandedId(volume.id, setExpandedVolumeIds)}
                    onSelect={() => choose({ type: "volume", id: volume.id })}
                    selectButtonRef={(node) => registerStructureNode({ type: "volume", id: volume.id }, node)}
                    draggable={!volume.archived}
                    draggedItem={draggedItem}
                    dropPreview={dropPreview}
                    onDragStart={setDraggedItem}
                    onDragEnd={() => { setDraggedItem(null); setDropPreview(null); }}
                    onDropPreview={setDropPreview}
                    acceptsDropTypes={["volume", "chapter"]}
                    onDropItem={(source, position) => {
                      if (source.type === "volume") void requestMove(source, currentNovel.id, position, volume.id);
                      if (source.type === "chapter") void requestMove(source, volume.id, "end");
                    }}
                  />
                  {!volume.archived ? (
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreate("chapter", { type: "volume", id: volume.id, title: volume.title })}
                        aria-label={`${translate("Add chapter to")} ${volume.title}`}
                      >
                        <Plus className="size-4" />{translate("Add chapter")}
                      </Button>
                    </div>
                  ) : null}
                  {volumeExpanded ? <div className="mt-2 space-y-2" role="group" aria-label={`${translate("Chapters in")} ${volume.title}`}>
                    {volumeChapters.length ? volumeChapters.map((chapter) => {
                      const chapterScenes = scenesByChapter.get(chapter.id) ?? [];
                      const chapterExpanded = expandedChapterIds.has(chapter.id);
                      return (
                        <div key={chapter.id} className={cn(chapter.archived && "opacity-65")}>
                          <StructureRow
                            item={{ type: "chapter", id: chapter.id }}
                            depth={1}
                            title={chapter.title}
                            subtitle={chapterExpanded ? `${formatNumber(chapter.wordCount)} ${translate("words")}` : compactCount(chapterScenes.length, "scene", null, "", translate)}
                            status={chapter.archived ? "Archived" : chapter.status}
                            selected={selection?.type === "chapter" && selection.id === chapter.id}
                            translate={translate}
                            nodeLabel={translate("Chapter")}
                            expandable
                            expanded={chapterExpanded}
                            onToggle={() => toggleExpandedId(chapter.id, setExpandedChapterIds)}
                            onSelect={() => choose({ type: "chapter", id: chapter.id })}
                            selectButtonRef={(node) => registerStructureNode({ type: "chapter", id: chapter.id }, node)}
                            draggable={!chapter.archived}
                            draggedItem={draggedItem}
                            dropPreview={dropPreview}
                            onDragStart={setDraggedItem}
                            onDragEnd={() => { setDraggedItem(null); setDropPreview(null); }}
                            onDropPreview={setDropPreview}
                            acceptsDropTypes={["chapter", "scene"]}
                            onDropItem={(source, position) => {
                              if (source.type === "chapter") void requestMove(source, volume.id, position, chapter.id);
                              if (source.type === "scene") void requestMove(source, chapter.id, "end");
                            }}
                          />
                          {!chapter.archived ? (
                            <div className="mt-1 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openCreate("scene", { type: "chapter", id: chapter.id, title: chapter.title })}
                                aria-label={`${translate("Add scene to")} ${chapter.title}`}
                              >
                                <Plus className="size-4" />{translate("Add scene")}
                              </Button>
                            </div>
                          ) : null}
                          {chapterExpanded ? <div className="space-y-2" role="group" aria-label={`${translate("Scenes in")} ${chapter.title}`}>
                            {chapterScenes.map((scene) => (
                              <StructureRow
                                item={{ type: "scene", id: scene.id }}
                                key={scene.id}
                                depth={2}
                                title={scene.title}
                                subtitle={scene.objective || `${formatNumber(scene.wordCount)} ${translate("words")}`}
                                status={scene.archived ? "Archived" : scene.status}
                                selected={selection?.type === "scene" && selection.id === scene.id}
                                translate={translate}
                                nodeLabel={translate("Scene")}
                                onSelect={() => choose({ type: "scene", id: scene.id })}
                                selectButtonRef={(node) => registerStructureNode({ type: "scene", id: scene.id }, node)}
                                draggable={!scene.archived}
                                draggedItem={draggedItem}
                                dropPreview={dropPreview}
                                onDragStart={setDraggedItem}
                                onDragEnd={() => { setDraggedItem(null); setDropPreview(null); }}
                                onDropPreview={setDropPreview}
                                acceptsDropTypes={["scene"]}
                                onDropItem={(source, position) => {
                                  if (source.type === "scene") void requestMove(source, chapter.id, position, scene.id);
                                }}
                              />
                            ))}
                          </div> : null}
                        </div>
                      );
                    }) : (
                      <div className="ml-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 bg-surface/74 p-3 text-sm text-muted-foreground">
                        <span>{translate("Empty volume. Add chapter to continue the outline.")}</span>
                        {!volume.archived ? <Button size="sm" variant="outline" onClick={() => openCreate("chapter", { type: "volume", id: volume.id, title: volume.title })}>
                          <Plus className="size-4" />{translate("Add chapter")}
                        </Button> : null}
                      </div>
                    )}
                  </div> : null}
                </div>
              );
            }) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" role="status">
                <p>{translate("No volumes yet. Add the first volume to begin the outline.")}</p>
                <Button className="mt-4" onClick={() => openCreate("volume")} disabled={!currentNovel.id}>
                  <FolderPlus className="size-4" />{translate("Add volume")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="surface-panel h-fit xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle id="structure-inspector-title">{selected?.title ?? translate("Outline actions")}</CardTitle>
            <CardDescription aria-live="polite">
              {selected
                ? `${translate(capitalize(selected.type))} · ${selected.archived ? translate("Archived") : translate("Active")}`
                : translate("Select a structure item")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selected ? <InspectorMetadata
              item={selected}
              currentNovelTitle={currentNovel.title}
              volumes={volumes}
              chapters={chapters}
              translate={translate}
            /> : <p className="rounded-lg border border-dashed border-border/70 bg-surface/60 p-4 text-sm text-muted-foreground" role="status">
              {translate("Choose a volume, chapter, or scene to see its context and available actions.")}
            </p>}
            {selected?.type === "scene" ? (
              <Button className="w-full justify-start" size="lg" disabled={busy || selected.archived} onClick={() => onOpenScene(selected.id)}>
                <PenLine className="size-4" />{translate("Open in editor")}
              </Button>
            ) : null}
            <section aria-labelledby="structure-organize-actions" className="space-y-2">
              <p id="structure-organize-actions" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{translate("Organize")}</p>
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start" disabled={!selected || busy} onClick={openEdit}>
                  <Edit3 className="size-4" />{translate("Edit details")}
                </Button>
                <Button variant="outline" className="justify-start" disabled={!selected || busy || selected.archived} onClick={() => void performAction("duplicate")}>
                  <Copy className="size-4" />{translate(duplicateLabel(selected, volumes, chapters, scenes))}
                </Button>
                <Button variant="outline" className="justify-start" disabled={!selected || busy || selected.archived} onClick={openMove}>
                  <Move className="size-4" />{translate("Move")}
                </Button>
              </div>
            </section>
            <section aria-labelledby="structure-risk-actions" className="space-y-2 border-t border-border/70 pt-4">
              <p id="structure-risk-actions" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{translate("Archive or delete")}</p>
              <Button variant="outline" className="w-full justify-start" disabled={!selected || busy} onClick={() => void performAction(selected?.archived ? "restore" : "archive")}>
                {selected?.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {translate(selected?.archived ? "Restore from archive" : "Archive item")}
              </Button>
              <Button variant="destructive" className="w-full justify-start" disabled={!selected || busy} onClick={() => { setError(""); setDialogMode("delete"); }}>
                <Trash2 className="size-4" />{translate("Delete permanently")}
              </Button>
            </section>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogMode === "create" || dialogMode === "edit"} onOpenChange={(open) => {
        if (!open) {
          setDialogMode(null);
          setCreateParent(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? translate(`Add ${form.type}`) : translate(`Edit ${form.type}`)}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create" && createParent ? (
                <span className="block" role="status">
                  {translate("Destination")}: {translate(capitalize(createParent.type))} — {createParent.title}
                </span>
              ) : null}
              <span className="block">{translate("Changes are persisted immediately to the local SQLite database.")}</span>
            </DialogDescription>
          </DialogHeader>
          <StructureFields form={form} locations={data.locations} onChange={setForm} />
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogMode(null); setCreateParent(null); }} disabled={busy}>{translate("Cancel")}</Button>
            <Button onClick={() => void submitForm()} disabled={busy}>{busy ? translate("Saving...") : translate("Save item")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "move"} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Move structure item")}</DialogTitle>
            <DialogDescription>
              {selected ? `${translate(capitalize(selected.type))}: ${selected.title}` : translate("Select a structure item")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="move-destination">{translate("Destination")}</Label>
              <Select value={moveParentId} onValueChange={(value) => { setMoveParentId(value); setMoveReferenceId(""); }}>
                <SelectTrigger id="move-destination" className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {moveParentOptions.map((parent) => <SelectItem key={parent.id} value={parent.id}>{parent.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="move-position">{translate("Position")}</Label>
              <Select value={movePosition} onValueChange={(value) => { setMovePosition(value as StructureMovePosition); setMoveReferenceId(""); }}>
                <SelectTrigger id="move-position" className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">{translate("Start")}</SelectItem>
                  <SelectItem value="end">{translate("End")}</SelectItem>
                  <SelectItem value="before">{translate("Before")}</SelectItem>
                  <SelectItem value="after">{translate("After")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {movePosition === "before" || movePosition === "after" ? (
              <div>
                <Label htmlFor="move-reference">{translate("Reference item")}</Label>
                <Select value={moveReferenceId} onValueChange={setMoveReferenceId}>
                  <SelectTrigger id="move-reference" className="mt-2"><SelectValue placeholder={translate("Choose an item")} /></SelectTrigger>
                  <SelectContent>
                    {moveReferenceOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={busy}>{translate("Cancel")}</Button>
            <Button onClick={submitMove} disabled={busy || !moveParentId}>{busy ? translate("Moving...") : translate("Move item")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "delete"} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Delete permanently?")}</DialogTitle>
          <DialogDescription>{deleteDescription(selected, deleteImpact)}</DialogDescription>
          </DialogHeader>
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={busy}>{translate("Cancel")}</Button>
            {deleteImpact?.hardDeleteBlocked ? (
              <Button onClick={() => { setDialogMode(null); void performAction("archive"); }} disabled={busy}>
                <Archive className="size-4" />{translate("Archive item instead")}
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>{busy ? translate("Deleting...") : translate("Delete permanently")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only" role="status" aria-live="polite">{moveAnnouncement}</p>
    </div>
  );
}

function InspectorMetadata({
  item,
  currentNovelTitle,
  volumes,
  chapters,
  translate
}: {
  item: SelectedItem;
  currentNovelTitle: string;
  volumes: Volume[];
  chapters: Chapter[];
  translate: (value: string) => string;
}) {
  const chapter = item.type === "scene" ? chapters.find((candidate) => candidate.id === item.chapterId) : undefined;
  const volumeId = item.type === "volume" ? item.id : item.type === "chapter" ? item.volumeId : chapter?.volumeId;
  const volume = volumes.find((candidate) => candidate.id === volumeId);
  const entries = item.type === "scene"
    ? [
        { label: translate("Status"), value: <StatusBadge status={item.archived ? "Archived" : item.status} translate={translate} /> },
        { label: translate("Words"), value: formatNumber(item.wordCount) },
        { label: translate("Chapter"), value: chapter?.title ?? translate("Unavailable") },
        { label: translate("Volume"), value: volume?.title ?? translate("Unavailable") }
      ]
    : item.type === "chapter"
      ? [
          { label: translate("Status"), value: <StatusBadge status={item.archived ? "Archived" : item.status} translate={translate} /> },
          { label: translate("Words"), value: formatNumber(item.wordCount) },
          { label: translate("Volume"), value: volume?.title ?? translate("Unavailable") },
          { label: translate("Novel"), value: currentNovelTitle }
        ]
      : [
          ...(item.archived
            ? [{ label: translate("Archive"), value: <StatusBadge status="Archived" translate={translate} /> }]
            : []),
          { label: translate("Novel"), value: currentNovelTitle },
          { label: translate("Summary"), value: item.summary || translate("No summary") }
        ];

  return (
    <section aria-label={translate("Selected item context")} className="rounded-lg border border-border/65 bg-surface/65 p-3">
      <dl className="grid gap-3 text-sm">
        {entries.map((entry) => (
          <div key={entry.label} className="grid gap-1">
            <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{entry.label}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  item,
  depth,
  title,
  subtitle,
  status,
  selected,
  strong = false,
  translate,
  nodeLabel,
  expandable = false,
  expanded = false,
  onToggle,
  onSelect,
  selectButtonRef,
  draggable = false,
  draggedItem,
  dropPreview,
  onDragStart,
  onDragEnd,
  onDropPreview,
  acceptsDropTypes = [],
  onDropItem
}: {
  item: StructureSelection;
  depth: number;
  title: string;
  subtitle: string;
  status?: ChapterStatus | "Archived";
  selected: boolean;
  strong?: boolean;
  translate: (value: string) => string;
  nodeLabel: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  selectButtonRef?: (node: HTMLButtonElement | null) => void;
  draggable?: boolean;
  draggedItem: StructureSelection | null;
  dropPreview: { id: string; position: StructureMovePosition } | null;
  onDragStart: (item: StructureSelection) => void;
  onDragEnd: () => void;
  onDropPreview: React.Dispatch<React.SetStateAction<{ id: string; position: StructureMovePosition } | null>>;
  acceptsDropTypes?: StructureItemType[];
  onDropItem: (source: StructureSelection, position: StructureMovePosition) => void;
}) {
  const acceptsDraggedItem = Boolean(
    draggedItem && acceptsDropTypes.includes(draggedItem.type) && !(draggedItem.type === item.type && draggedItem.id === item.id)
  );
  const previewPosition = (event: React.DragEvent<HTMLDivElement>): StructureMovePosition => {
    if (!draggedItem || draggedItem.type !== item.type) return "end";
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      className={cn(
        "flex w-[calc(100%-var(--structure-indent))] items-center gap-3 rounded-lg bg-card/82 p-3 shadow-soft ring-1 ring-border/55 transition-colors hover:bg-secondary/35",
        selected && "bg-secondary/55 ring-2 ring-primary/55",
        draggedItem?.type === item.type && draggedItem.id === item.id && "opacity-55",
        dropPreview?.id === item.id && dropPreview.position === "before" && "border-t-4 border-t-primary",
        dropPreview?.id === item.id && dropPreview.position !== "before" && "border-b-4 border-b-primary"
      )}
      style={{ marginLeft: `${depth * 1.5}rem`, "--structure-indent": `${depth * 1.5}rem` } as React.CSSProperties}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${item.type}:${item.id}`);
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!acceptsDraggedItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDropPreview({ id: item.id, position: previewPosition(event) });
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) onDropPreview(null);
      }}
      onDrop={(event) => {
        if (!acceptsDraggedItem || !draggedItem) return;
        event.preventDefault();
        onDropItem(draggedItem, previewPosition(event));
      }}
    >
      {draggable ? <span className="grid size-5 shrink-0 place-items-center text-muted-foreground" aria-label={translate("Drag to move")} title={translate("Drag to move")}><GripVertical className="size-4" /></span> : null}
      {expandable ? (
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md border border-border/60 bg-surface text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${translate(expanded ? "Collapse" : "Expand")} ${nodeLabel}: ${title}`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/60 bg-surface text-muted-foreground" aria-hidden="true"><Workflow className="size-4" /></span>
      )}
      <button ref={selectButtonRef} type="button" className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-left" onClick={onSelect} aria-pressed={selected}>
        <span className="min-w-0">
          <span className={cn("block truncate text-[14px]", strong && "font-semibold")}>{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        {status ? <StatusBadge status={status} translate={translate} /> : null}
        <span className="grid size-8 place-items-center text-muted-foreground" aria-hidden="true"><MoreHorizontal className="size-4" /></span>
      </button>
    </div>
  );
}

function toggleExpandedId(id: string, setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function compactCount(
  primaryCount: number,
  primaryLabel: string,
  secondaryCount: number | null,
  secondaryLabel: string,
  translate: (value: string) => string
) {
  const primary = `${formatNumber(primaryCount)} ${translate(primaryCount === 1 ? primaryLabel : `${primaryLabel}s`)}`;
  if (secondaryCount === null) return primary;
  return `${primary} · ${formatNumber(secondaryCount)} ${translate(secondaryCount === 1 ? secondaryLabel : `${secondaryLabel}s`)}`;
}

function groupByParentId<T extends { volumeId?: string; chapterId?: string }>(
  items: readonly T[],
  parentKey: "volumeId" | "chapterId"
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const parentId = item[parentKey];
    if (!parentId) continue;
    const group = groups.get(parentId);
    if (group) group.push(item);
    else groups.set(parentId, [item]);
  }
  return groups;
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

function firstSelection(volumes: Volume[]): StructureSelection | null {
  const firstVolume = volumes[0];
  if (!firstVolume) return null;
  return { type: "volume", id: firstVolume.id };
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

function deleteDescription(selected: SelectedItem | null, impact: StructureDeleteImpact | null) {
  if (!selected) return "This action cannot be undone.";
  if (impact && impact.hardDeleteBlocked) {
    const chapterText = impact.chapterCount ? `${impact.chapterCount} ${impact.chapterCount === 1 ? "chapter" : "chapters"}` : "";
    const sceneText = `${impact.sceneCount} ${impact.sceneCount === 1 ? "scene" : "scenes"}`;
    const impactText = [chapterText, sceneText, `${formatNumber(impact.wordCount)} words`].filter(Boolean).join(", ");
    return `“${selected.title}” contains ${impactText}. Permanent deletion is blocked to protect this hierarchy. Archive it instead; it can be restored later.`;
  }
  if (selected.type === "scene" && impact && impact.wordCount > 0) return `“${selected.title}” contains ${formatNumber(impact.wordCount)} words. This permanent action cannot be undone.`;
  return `“${selected.title}” will be permanently deleted. This action cannot be undone.`;
}

function duplicateLabel(
  selected: SelectedItem | null,
  volumes: Volume[],
  chapters: Chapter[],
  scenes: Scene[]
) {
  if (!selected) return "Duplicate";
  const impact = getStructureDeleteImpact(selected.type, selected.id, volumes, chapters, scenes);
  if (selected.type === "volume") return `Duplicate volume with ${impact.chapterCount} ${impact.chapterCount === 1 ? "chapter" : "chapters"} and ${impact.sceneCount} ${impact.sceneCount === 1 ? "scene" : "scenes"}`;
  if (selected.type === "chapter") return `Duplicate chapter with ${impact.sceneCount} ${impact.sceneCount === 1 ? "scene" : "scenes"}`;
  return "Duplicate scene";
}
