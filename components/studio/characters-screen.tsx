"use client";
import { AddStoryNoteButton } from "./note-capture";
import { StoryNotes } from "./story-notes";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ArchiveRestore, Check, ExternalLink, Link2, Pencil, Plus, RotateCcw, Search, Trash2, UserRound } from "lucide-react";

import {
  EmptyState,
  FieldLine,
  SectionHeader,
  StatusBadge
} from "@/components/studio/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { type StudioData } from "@/lib/studio-data";
import {
  characterPlaceRelationshipTypes,
  type Character,
  type CharacterPlaceRelationshipType
} from "@/lib/studio-domain";
import { relationshipViewForCharacter } from "@/lib/character-relationship";
import { routeForCharacter, routeForPage, routeForPlace } from "@/lib/studio-routes";
import { cn } from "@/lib/utils";

type CharacterDeleteImpact = {
  characterId: string;
  name: string;
  linkedScenes: number;
  linkedPlaces: number;
  relationships: number;
  linkedEvents?: number;
  canDelete: boolean;
};

export function CharactersScreen({
  data,
  characters,
  query,
  role,
  status,
  sort,
  showArchived,
  roleOptions,
  statusOptions,
  sortOptions,
  translate,
  onQueryChange,
  onRoleChange,
  onStatusChange,
  onSortChange,
  onClearFilters,
  onShowArchivedChange,
  selectedCharacterId,
  characterHref,
  onAddCharacter,
  onEditCharacter,
  onSceneLinksChanged,
  onPlaceLinksChanged,
  onArchiveCharacter,
  onRestoreCharacter,
  onDeleteCharacter
}: {
  data: StudioData;
  characters: Character[];
  query: string;
  role: string;
  status: string;
  sort: string;
  showArchived: boolean;
  roleOptions: string[];
  statusOptions: string[];
  sortOptions: readonly string[];
  translate: (value: string) => string;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onClearFilters: () => void;
  onShowArchivedChange: (value: boolean) => void;
  selectedCharacterId: string | null;
  characterHref: (characterId: string) => string;
  onAddCharacter: () => void;
  onEditCharacter: (character: Character) => void;
  onSceneLinksChanged: () => Promise<unknown>;
  onPlaceLinksChanged: () => Promise<unknown>;
  onArchiveCharacter: (character: Character) => Promise<void>;
  onRestoreCharacter: (character: Character) => Promise<void>;
  onDeleteCharacter: (character: Character, impact: CharacterDeleteImpact) => Promise<void>;
}) {
  const [mobileDetailOpen, setMobileDetailOpen] = React.useState(false);
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");
  const [detailReloadToken, setDetailReloadToken] = React.useState(0);
  const catalogCharacters = characters.filter((character) =>
    data.novels.some((novel) => novel.id === character.novelId)
  );
  const selectedCharacterSummary = selectedCharacterId
    ? data.characters.find((character) => character.id === selectedCharacterId) ?? null
    : null;
  const selectedSummaryId = selectedCharacterSummary?.id;
  const selectedSummaryNovelId = selectedCharacterSummary?.novelId;

  React.useEffect(() => {
    if (!selectedCharacterSummary) {
      setMobileDetailOpen(false);
      return;
    }
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setMobileDetailOpen(true);
    }
  }, [selectedCharacterId, selectedCharacterSummary]);

  React.useEffect(() => {
    if (!selectedSummaryId || !selectedSummaryNovelId) {
      setSelectedCharacter(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }

    const controller = new AbortController();
    setSelectedCharacter(null);
    setDetailLoading(true);
    setDetailError("");
    void fetch(
      `/api/characters/${encodeURIComponent(selectedSummaryId)}?novelId=${encodeURIComponent(selectedSummaryNovelId)}`,
      { cache: "no-store", signal: controller.signal }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (Character & { error?: string }) | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Could not load character details");
        }
        setSelectedCharacter(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetailError(error instanceof Error ? error.message : "Could not load character details");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [detailReloadToken, selectedSummaryId, selectedSummaryNovelId]);

  React.useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1280px)");
    const closeDrawerOnDesktop = () => {
      if (desktopMedia.matches) setMobileDetailOpen(false);
    };

    closeDrawerOnDesktop();
    desktopMedia.addEventListener("change", closeDrawerOnDesktop);
    return () => desktopMedia.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  const openMobileDetail = () => {
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setMobileDetailOpen(true);
    }
  };

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={translate("Characters")}
        title={translate("Character bible")}
        description={translate(
          "Track roles, secrets, voice notes, first appearances, and connected story material."
        )}
        action={
          <Button onClick={onAddCharacter}>
            <Plus className="size-4" />
            {translate("Add character")}
          </Button>
        }
      />

      <Card className="surface-panel">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_170px_170px_180px_auto_auto] xl:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={translate("Search characters")}
              className="pl-9"
            />
          </div>
          <Select value={role} onValueChange={onRoleChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={onSortChange}>
            <SelectTrigger aria-label={translate("Sort characters")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showArchived ? "secondary" : "outline"}
            aria-pressed={showArchived}
            onClick={() => onShowArchivedChange(!showArchived)}
          >
            <Archive className="size-4" />
            {translate("Show archived")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClearFilters}
            disabled={!query && role === "All roles" && status === "All statuses" && sort === "Name" && !showArchived}
          >
            <RotateCcw className="size-4" />
            {translate("Clear filters")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {catalogCharacters.length ? (
          <div className="grid content-start gap-3 2xl:grid-cols-2">
            {catalogCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                selected={character.id === selectedCharacterSummary?.id}
                translate={translate}
                href={characterHref(character.id)}
                onSelect={openMobileDetail}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UserRound}
            title={translate("No characters match those filters")}
            description={translate("Adjust role, status, or search text to find a character.")}
          />
        )}

        <div className="hidden xl:block">
          {detailLoading ? (
            <CharacterDetailLoading translate={translate} />
          ) : detailError ? (
            <CharacterDetailError
              message={detailError}
              translate={translate}
              onRetry={() => setDetailReloadToken((value) => value + 1)}
            />
          ) : selectedCharacter ? (
            <CharacterDetailPanel
              character={selectedCharacter}
              data={data}
              translate={translate}
              onEdit={() => onEditCharacter(selectedCharacter)}
              onSceneLinksChanged={onSceneLinksChanged}
              onPlaceLinksChanged={onPlaceLinksChanged}
              onArchiveCharacter={onArchiveCharacter}
              onRestoreCharacter={onRestoreCharacter}
              onDeleteCharacter={onDeleteCharacter}
            />
          ) : (
            <EmptyState
              icon={UserRound}
              title={translate("Select a character")}
              description={translate("Choose a character from the catalog to open their profile.")}
            />
          )}
        </div>
      </div>

      {!selectedCharacterSummary && catalogCharacters.length ? (
        <div className="xl:hidden">
          <EmptyState
            icon={UserRound}
            title={translate("Select a character")}
            description={translate("Choose a character from the catalog to open their profile.")}
          />
        </div>
      ) : null}

      <Dialog open={mobileDetailOpen && Boolean(selectedCharacterSummary)} onOpenChange={setMobileDetailOpen}>
        <DialogContent className="h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto p-0 xl:hidden sm:max-h-[calc(100dvh-2rem)] sm:h-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedCharacterSummary?.name ?? translate("Character profile")}</DialogTitle>
            <DialogDescription>
              {translate("Character details and connected story material.")}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <CharacterDetailLoading translate={translate} />
          ) : detailError ? (
            <CharacterDetailError
              message={detailError}
              translate={translate}
              onRetry={() => setDetailReloadToken((value) => value + 1)}
            />
          ) : selectedCharacter ? (
            <CharacterDetailPanel
              character={selectedCharacter}
              data={data}
              translate={translate}
              onEdit={() => { setMobileDetailOpen(false); onEditCharacter(selectedCharacter); }}
              onSceneLinksChanged={onSceneLinksChanged}
              onPlaceLinksChanged={onPlaceLinksChanged}
              onArchiveCharacter={onArchiveCharacter}
              onRestoreCharacter={onRestoreCharacter}
              onDeleteCharacter={onDeleteCharacter}
              className="border-0 shadow-none"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CharacterCard({
  character,
  selected,
  translate,
  href,
  onSelect
}: {
  character: Character;
  selected: boolean;
  translate: (value: string) => string;
  href: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      aria-label={`${translate("Open character profile")}: ${character.name}`}
      onClick={onSelect}
      className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        className={cn(
          "surface-panel h-full transition-colors hover:border-primary/45 hover:bg-primary/[0.025]",
          selected && "border-primary/75 bg-primary/[0.07] shadow-lift"
        )}
      >
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[52px_1fr]">
          <div className="grid size-[3.25rem] place-items-center rounded-full border border-border/55 bg-surface-elevated text-primary shadow-paper-sm">
            <UserRound className="size-6" />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{character.name}</h3>
                <p className="truncate text-sm text-muted-foreground">{translate(character.role)}</p>
              </div>
              {selected ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                  <Check className="size-3" aria-hidden="true" />
                  {translate("Selected")}
                </span>
              ) : (
                <StatusBadge status={character.status} translate={translate} />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{translate(character.role)}</Badge>
              {selected ? <StatusBadge status={character.status} translate={translate} /> : null}
            </div>
            <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <CompactFact label={translate("Scenes")} value={character.scenes} />
              <CompactFact
                label={translate("First appearance")}
                value={character.firstAppearance || translate("Not linked yet")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompactFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm text-foreground">{value}</p>
    </div>
  );
}

function CharacterDetailPanel({
  character,
  data,
  translate,
  onEdit,
  onSceneLinksChanged,
  onPlaceLinksChanged,
  onArchiveCharacter,
  onRestoreCharacter,
  onDeleteCharacter,
  className
}: {
  character: Character;
  data: StudioData;
  translate: (value: string) => string;
  onEdit: () => void;
  onSceneLinksChanged: () => Promise<unknown>;
  onPlaceLinksChanged: () => Promise<unknown>;
  onArchiveCharacter: (character: Character) => Promise<void>;
  onRestoreCharacter: (character: Character) => Promise<void>;
  onDeleteCharacter: (character: Character, impact: CharacterDeleteImpact) => Promise<void>;
  className?: string;
}) {
  type LinkedScene = {
    sceneId: string;
    sceneTitle: string;
    chapterTitle: string;
    volumeTitle: string;
  };
  type LinkedPlace = {
    locationId: string;
    name: string;
    type: string;
    region: string;
    relationshipType: CharacterPlaceRelationshipType;
  };
  const [linkedScenes, setLinkedScenes] = React.useState<LinkedScene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = React.useState("");
  const [sceneLinksLoading, setSceneLinksLoading] = React.useState(true);
  const [sceneLinkPending, setSceneLinkPending] = React.useState(false);
  const [sceneLinkError, setSceneLinkError] = React.useState("");
  const [linkedPlaces, setLinkedPlaces] = React.useState<LinkedPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = React.useState("");
  const [selectedPlaceRelationshipType, setSelectedPlaceRelationshipType] =
    React.useState<CharacterPlaceRelationshipType>("Associated with");
  const [placeLinksLoading, setPlaceLinksLoading] = React.useState(true);
  const [placeLinkPending, setPlaceLinkPending] = React.useState(false);
  const [placeLinkError, setPlaceLinkError] = React.useState("");
  const [lifecycleDialog, setLifecycleDialog] = React.useState<"archive" | "delete" | null>(null);
  const [deleteImpact, setDeleteImpact] = React.useState<CharacterDeleteImpact | null>(null);
  const [lifecyclePending, setLifecyclePending] = React.useState(false);
  const [lifecycleError, setLifecycleError] = React.useState("");
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const linkedSceneIds = React.useMemo(() => new Set(linkedScenes.map((scene) => scene.sceneId)), [linkedScenes]);
  const availableScenes = data.scenes.filter((scene) => !scene.archived && !linkedSceneIds.has(scene.id));
  const linkedPlaceIds = React.useMemo(
    () => new Set(linkedPlaces.map((place) => place.locationId)),
    [linkedPlaces]
  );
  const availablePlaces = data.locations.filter(
    (place) => place.novelId === character.novelId && !linkedPlaceIds.has(place.id)
  );
  const sceneContext = (sceneId: string) => {
    const scene = data.scenes.find((item) => item.id === sceneId);
    const chapter = data.chapters.find((item) => item.id === scene?.chapterId);
    const volume = data.volumes.find((item) => item.id === chapter?.volumeId);
    return { scene, chapter, volume };
  };

  const loadLinkedScenes = React.useCallback(async () => {
    setSceneLinksLoading(true);
    setSceneLinkError("");
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/scenes`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load linked scenes");
      setLinkedScenes((await response.json()) as LinkedScene[]);
    } catch (error) {
      setSceneLinkError(error instanceof Error ? error.message : "Could not load linked scenes");
    } finally {
      setSceneLinksLoading(false);
    }
  }, [character.id]);

  React.useEffect(() => { void loadLinkedScenes(); }, [loadLinkedScenes]);

  const loadLinkedPlaces = React.useCallback(async () => {
    setPlaceLinksLoading(true);
    setPlaceLinkError("");
    try {
      const response = await fetch(
        `/api/characters/${encodeURIComponent(character.id)}/places?novelId=${encodeURIComponent(character.novelId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load linked places");
      setLinkedPlaces((await response.json()) as LinkedPlace[]);
    } catch (error) {
      setPlaceLinkError(error instanceof Error ? error.message : "Could not load linked places");
    } finally {
      setPlaceLinksLoading(false);
    }
  }, [character.id, character.novelId]);

  React.useEffect(() => { void loadLinkedPlaces(); }, [loadLinkedPlaces]);

  React.useEffect(() => {
    titleRef.current?.focus();
  }, [character.id]);

  const updateSceneLink = async (method: "POST" | "DELETE", sceneId: string) => {
    setSceneLinkPending(true);
    setSceneLinkError("");
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/scenes`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not update linked scenes");
      }
      setSelectedSceneId("");
      await Promise.all([loadLinkedScenes(), onSceneLinksChanged()]);
    } catch (error) {
      setSceneLinkError(error instanceof Error ? error.message : "Could not update linked scenes");
    } finally {
      setSceneLinkPending(false);
    }
  };
  const updatePlaceLink = async (method: "POST" | "DELETE", locationId: string) => {
    setPlaceLinkPending(true);
    setPlaceLinkError("");
    try {
      const response = await fetch(
        `/api/characters/${encodeURIComponent(character.id)}/places?novelId=${encodeURIComponent(character.novelId)}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId,
            ...(method === "POST"
              ? { relationshipType: selectedPlaceRelationshipType }
              : {})
          })
        }
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not update linked places");
      }
      setSelectedPlaceId("");
      await Promise.all([loadLinkedPlaces(), onPlaceLinksChanged()]);
    } catch (error) {
      setPlaceLinkError(error instanceof Error ? error.message : "Could not update linked places");
    } finally {
      setPlaceLinkPending(false);
    }
  };
  const loadDeleteImpact = async () => {
    setDeleteImpact(null);
    try {
      const response = await fetch(
        `/api/characters/${encodeURIComponent(character.id)}/impact`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as CharacterDeleteImpact & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load delete impact");
      setDeleteImpact(payload);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Could not load delete impact");
    }
  };
  const openDeleteImpact = () => {
    setLifecycleDialog("delete");
    setLifecycleError("");
    void loadDeleteImpact();
  };
  const runLifecycleAction = async (action: "archive" | "restore" | "delete") => {
    setLifecyclePending(true);
    setLifecycleError("");
    try {
      if (action === "archive") await onArchiveCharacter(character);
      if (action === "restore") await onRestoreCharacter(character);
      if (action === "delete" && deleteImpact) {
        await onDeleteCharacter(character, deleteImpact);
      }
      setLifecycleDialog(null);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Could not update character");
      if (action === "delete") await loadDeleteImpact();
    } finally {
      setLifecyclePending(false);
    }
  };
  const relationships = data.relationships
    .filter(
      (relationship) =>
        relationship.fromCharacterId === character.id ||
        relationship.toCharacterId === character.id
    )
    .map((relationship) => {
      const view = relationshipViewForCharacter(relationship, character.id);
      if (!view) return null;
      const other = data.characters.find((candidate) => candidate.id === view.otherCharacterId);
      if (!other || other.novelId !== character.novelId) {
        return { id: relationship.id, character: null, label: view.label };
      }
      return { id: relationship.id, character: other, label: view.label };
    })
    .filter((relationship): relationship is {
      id: string;
      character: Character | null;
      label: string;
    } => Boolean(relationship));
  const valueOrFallback = (value: React.ReactNode) =>
    value === "" || value === null || value === undefined
      ? translate("Not specified")
      : value;

  return (
    <>
    <Card className={cn("surface-elevated min-w-0 xl:sticky xl:top-24", className)}>
      <CardHeader>
        <div className="grid gap-4 sm:grid-cols-[90px_1fr]">
          <div className="grid size-[5.5rem] place-items-center rounded-xl border border-border/55 bg-surface-elevated text-primary shadow-paper-sm">
            <UserRound className="size-10" />
          </div>
          <div>
            <div className="flex items-start justify-between gap-3">
              <CardTitle ref={titleRef} tabIndex={-1}>{character.name}</CardTitle>
              <div className="flex flex-wrap justify-end gap-2">
                <AddStoryNoteButton target={{ novelId: character.novelId, type: "Character", id: character.id, title: character.name }} disabled={lifecyclePending} />
                {character.status === "Archived" ? (
                  <Button type="button" size="sm" variant="outline" disabled={lifecyclePending} onClick={() => void runLifecycleAction("restore")}>
                    <ArchiveRestore className="size-4" /> {translate("Restore")}
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={onEdit}>
                      <Pencil className="size-4" /> {translate("Edit character")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setLifecycleError(""); setLifecycleDialog("archive"); }}>
                      <Archive className="size-4" /> {translate("Archive")}
                    </Button>
                  </>
                )}
                <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`${translate("Delete character")}: ${character.name}`} onClick={openDeleteImpact}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <CardDescription>{character.alias}</CardDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={character.status} translate={translate} />
              <Badge variant="outline">{translate(character.role)}</Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <StoryNotes target={{ novelId: character.novelId, type: "Character", id: character.id, title: character.name }} />
        <DetailSection title={translate("Identity")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLine label={translate("Age")} value={valueOrFallback(character.age)} />
            {character.narrativeStatus ? (
              <FieldLine label={translate("Narrative state")} value={translate(character.narrativeStatus)} />
            ) : null}
            <FieldLine
              label={translate("First appearance")}
              value={character.firstAppearance || translate("Not linked yet")}
            />
          </div>
        </DetailSection>
        <DetailSection title={translate("Characterization")}>
          <div className="grid gap-3">
            <FieldLine label={translate("Appearance")} value={valueOrFallback(character.appearance)} />
            <FieldLine label={translate("Personality")} value={valueOrFallback(character.personality)} />
            <FieldLine label={translate("Way of speaking")} value={valueOrFallback(character.wayOfSpeaking)} />
          </div>
        </DetailSection>
        <DetailSection title={translate("Motivation and continuity")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLine label={translate("Goal")} value={valueOrFallback(character.goal)} />
            <FieldLine label={translate("Fear")} value={valueOrFallback(character.fear)} />
            <FieldLine label={translate("Secret")} value={valueOrFallback(character.secret)} />
            <FieldLine label={translate("Notes")} value={valueOrFallback(character.notes)} />
          </div>
        </DetailSection>
        <DetailSection title={translate("Story connections")}>
          <div className="grid gap-3">
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/45 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{translate("Linked scenes")}</p>
                  <p className="text-xs text-muted-foreground">{linkedScenes.length} {translate("Scenes").toLowerCase()}</p>
                </div>
                <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              {sceneLinksLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {!sceneLinksLoading && linkedScenes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{translate("No linked scenes yet")}</p>
              ) : null}
              {linkedScenes.map((scene) => (
                <div key={scene.sceneId} className="flex items-center gap-2 rounded-md border border-border/50 bg-card p-2">
                  <Link
                    href={routeForPage("editor", character.novelId, scene.sceneId)}
                    className="min-w-0 flex-1 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${translate("Open scene in editor")}: ${scene.sceneTitle}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{scene.sceneTitle}</span><ExternalLink className="size-3 shrink-0" /></span>
                    <span className="block truncate text-xs text-muted-foreground">{scene.volumeTitle} · {scene.chapterTitle}</span>
                  </Link>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={sceneLinkPending}
                    aria-label={`${translate("Remove linked scene")}: ${scene.sceneTitle}`}
                    onClick={() => void updateSceneLink("DELETE", scene.sceneId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <Select value={selectedSceneId} onValueChange={setSelectedSceneId} disabled={sceneLinkPending || availableScenes.length === 0}>
                  <SelectTrigger aria-label={translate("Select scene to link")} className="min-w-0 flex-1"><SelectValue placeholder={translate("Link scene")} /></SelectTrigger>
                  <SelectContent>
                    {availableScenes.map((scene) => {
                      const context = sceneContext(scene.id);
                      return <SelectItem key={scene.id} value={scene.id}>{context.volume?.title} · {context.chapter?.title} · {scene.title}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" disabled={!selectedSceneId || sceneLinkPending} onClick={() => void updateSceneLink("POST", selectedSceneId)}>
                  <Plus className="size-4" /> {translate("Link")}
                </Button>
              </div>
              {sceneLinkError ? <p role="alert" className="text-sm text-destructive">{sceneLinkError}</p> : null}
            </div>
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/45 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{translate("Linked places")}</p>
                  <p className="text-xs text-muted-foreground">{linkedPlaces.length} {translate("Places").toLowerCase()}</p>
                </div>
                <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              {placeLinksLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {!placeLinksLoading && linkedPlaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">{translate("No linked places yet")}</p>
              ) : null}
              {linkedPlaces.map((place) => (
                <div key={place.locationId} className="flex items-center gap-2 rounded-md border border-border/50 bg-card p-2">
                  <Link
                    href={routeForPlace(character.novelId, place.locationId)}
                    className="min-w-0 flex-1 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${translate("Open place")}: ${place.name}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{place.name}</span><ExternalLink className="size-3 shrink-0" /></span>
                    <span className="block truncate text-xs text-muted-foreground">{translate(place.relationshipType)}{place.region ? ` · ${place.region}` : ""}</span>
                  </Link>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={placeLinkPending}
                    aria-label={`${translate("Remove linked place")}: ${place.name}`}
                    onClick={() => void updatePlaceLink("DELETE", place.locationId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Select value={selectedPlaceId} onValueChange={setSelectedPlaceId} disabled={placeLinkPending || availablePlaces.length === 0}>
                  <SelectTrigger aria-label={translate("Select place to link")} className="min-w-0"><SelectValue placeholder={translate("Link place")} /></SelectTrigger>
                  <SelectContent>
                    {availablePlaces.map((place) => <SelectItem key={place.id} value={place.id}>{place.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedPlaceRelationshipType} onValueChange={(value) => setSelectedPlaceRelationshipType(value as CharacterPlaceRelationshipType)} disabled={placeLinkPending}>
                  <SelectTrigger aria-label={translate("Place relationship type")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {characterPlaceRelationshipTypes.map((type) => <SelectItem key={type} value={type}>{translate(type)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" disabled={!selectedPlaceId || placeLinkPending} onClick={() => void updatePlaceLink("POST", selectedPlaceId)}>
                  <Plus className="size-4" /> {translate("Link")}
                </Button>
              </div>
              {placeLinkError ? <p role="alert" className="text-sm text-destructive">{placeLinkError}</p> : null}
            </div>
            <FieldLine
              label={translate("Relationships")}
              value={relationships.length ? (
                <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 overflow-hidden">
                  {relationships.map(({ id, character: relatedCharacter, label }) =>
                    relatedCharacter ? (
                      <Link
                        key={id}
                        href={routeForCharacter(character.novelId, relatedCharacter.id)}
                        className="min-w-0 break-words text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {relatedCharacter.name} — {label}
                      </Link>
                    ) : (
                      <span key={id} className="break-words text-muted-foreground">
                        {translate("Related character unavailable")} — {label}
                      </span>
                    )
                  )}
                </span>
              ) : translate("None yet")}
            />
          </div>
        </DetailSection>
      </CardContent>
    </Card>
    <Dialog open={lifecycleDialog === "archive"} onOpenChange={(open) => !open && !lifecyclePending && setLifecycleDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("Archive character")}</DialogTitle>
          <DialogDescription>
            {translate("The character will leave the active catalog. Linked scenes, places, and relationships will be preserved.")}
          </DialogDescription>
        </DialogHeader>
        {lifecycleError ? <p role="alert" className="text-sm text-destructive">{lifecycleError}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={lifecyclePending} onClick={() => setLifecycleDialog(null)}>{translate("Cancel")}</Button>
          <Button type="button" disabled={lifecyclePending} onClick={() => void runLifecycleAction("archive")}>
            <Archive className="size-4" /> {lifecyclePending ? translate("Archiving…") : translate("Archive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={lifecycleDialog === "delete"} onOpenChange={(open) => !open && !lifecyclePending && setLifecycleDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("Delete character permanently")}</DialogTitle>
          <DialogDescription>
            {translate("Review the current impact before permanently deleting this character.")}
          </DialogDescription>
        </DialogHeader>
        {!deleteImpact && !lifecycleError ? <p className="text-sm text-muted-foreground">{translate("Loading impact…")}</p> : null}
        {deleteImpact ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldLine label={translate("Linked scenes")} value={deleteImpact.linkedScenes} />
            <FieldLine label={translate("Linked places")} value={deleteImpact.linkedPlaces} />
            <FieldLine label={translate("Relationships")} value={deleteImpact.relationships} />
            <FieldLine label="Timeline events" value={deleteImpact.linkedEvents ?? 0} />
          </div>
        ) : null}
        {deleteImpact && !deleteImpact.canDelete ? (
          <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{translate("This character is referenced and cannot be permanently deleted. Archive it instead.")}</p>
          </div>
        ) : null}
        {lifecycleError ? <p role="alert" className="text-sm text-destructive">{lifecycleError}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={lifecyclePending} onClick={() => setLifecycleDialog(null)}>{translate("Cancel")}</Button>
          {deleteImpact && !deleteImpact.canDelete && character.status !== "Archived" ? (
            <Button type="button" disabled={lifecyclePending} onClick={() => { setLifecycleDialog(null); setLifecycleError(""); setLifecycleDialog("archive"); }}>
              <Archive className="size-4" /> {translate("Archive instead")}
            </Button>
          ) : null}
          <Button type="button" variant="destructive" disabled={!deleteImpact?.canDelete || lifecyclePending} onClick={() => void runLifecycleAction("delete")}>
            <Trash2 className="size-4" /> {lifecyclePending ? translate("Deleting…") : translate("Delete permanently")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function CharacterDetailLoading({ translate }: { translate: (value: string) => string }) {
  return (
    <Card className="surface-elevated" aria-busy="true">
      <CardContent className="p-6 text-sm text-muted-foreground">
        {translate("Loading character details…")}
      </CardContent>
    </Card>
  );
}

function CharacterDetailError({
  message,
  translate,
  onRetry
}: {
  message: string;
  translate: (value: string) => string;
  onRetry: () => void;
}) {
  return (
    <Card className="surface-elevated" role="alert">
      <CardHeader>
        <CardTitle>{translate("Character details unavailable")}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RotateCcw className="size-4" /> {translate("Retry")}
        </Button>
      </CardContent>
    </Card>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}
