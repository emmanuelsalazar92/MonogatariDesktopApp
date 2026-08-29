"use client";

import * as React from "react";
import { Check, ExternalLink, Link2, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";

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
import {
  placeName,
  uniqueStrings,
  type StudioData
} from "@/lib/studio-data";
import { type Character } from "@/lib/studio-domain";
import { relationshipViewForCharacter } from "@/lib/character-relationship";
import { cn } from "@/lib/utils";

export function CharactersScreen({
  data,
  characters,
  query,
  role,
  status,
  roleOptions,
  statusOptions,
  translate,
  onQueryChange,
  onRoleChange,
  onStatusChange,
  onAddCharacter,
  onEditCharacter,
  onOpenScene,
  onSceneLinksChanged
}: {
  data: StudioData;
  characters: Character[];
  query: string;
  role: string;
  status: string;
  roleOptions: string[];
  statusOptions: string[];
  translate: (value: string) => string;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onAddCharacter: () => void;
  onEditCharacter: (character: Character) => void;
  onOpenScene: (sceneId: string) => void;
  onSceneLinksChanged: () => Promise<unknown>;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = React.useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = React.useState(false);
  const catalogCharacters = characters.filter((character) =>
    data.novels.some((novel) => novel.id === character.novelId)
  );
  const selectedCharacter = selectedCharacterId
    ? catalogCharacters.find((character) => character.id === selectedCharacterId) ?? null
    : null;

  React.useEffect(() => {
    if (selectedCharacterId && !selectedCharacter) {
      setSelectedCharacterId(null);
      setMobileDetailOpen(false);
    }
  }, [selectedCharacter, selectedCharacterId]);

  React.useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1280px)");
    const closeDrawerOnDesktop = () => {
      if (desktopMedia.matches) setMobileDetailOpen(false);
    };

    closeDrawerOnDesktop();
    desktopMedia.addEventListener("change", closeDrawerOnDesktop);
    return () => desktopMedia.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  const selectCharacter = (characterId: string) => {
    setSelectedCharacterId(characterId);
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
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_190px_190px] lg:p-5">
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
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {catalogCharacters.length ? (
          <div className="grid content-start gap-3 2xl:grid-cols-2">
            {catalogCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                selected={character.id === selectedCharacter?.id}
                translate={translate}
                onSelect={() => selectCharacter(character.id)}
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
          {selectedCharacter ? (
            <CharacterDetailPanel
              character={selectedCharacter}
              data={data}
              translate={translate}
              onEdit={() => onEditCharacter(selectedCharacter)}
              onOpenScene={onOpenScene}
              onSceneLinksChanged={onSceneLinksChanged}
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

      {!selectedCharacter && catalogCharacters.length ? (
        <div className="xl:hidden">
          <EmptyState
            icon={UserRound}
            title={translate("Select a character")}
            description={translate("Choose a character from the catalog to open their profile.")}
          />
        </div>
      ) : null}

      <Dialog open={mobileDetailOpen && Boolean(selectedCharacter)} onOpenChange={setMobileDetailOpen}>
        <DialogContent className="h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto p-0 xl:hidden sm:max-h-[calc(100dvh-2rem)] sm:h-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedCharacter?.name ?? translate("Character profile")}</DialogTitle>
            <DialogDescription>
              {translate("Character details and connected story material.")}
            </DialogDescription>
          </DialogHeader>
          {selectedCharacter ? (
            <CharacterDetailPanel
              character={selectedCharacter}
              data={data}
              translate={translate}
              onEdit={() => { setMobileDetailOpen(false); onEditCharacter(selectedCharacter); }}
              onOpenScene={onOpenScene}
              onSceneLinksChanged={onSceneLinksChanged}
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
  onSelect
}: {
  character: Character;
  selected: boolean;
  translate: (value: string) => string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
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
                <p className="truncate text-sm text-muted-foreground">
                  {character.alias || translate("No alias")}
                </p>
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
                value={character.firstAppearance || translate("Not specified")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
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
  onOpenScene,
  onSceneLinksChanged,
  className
}: {
  character: Character;
  data: StudioData;
  translate: (value: string) => string;
  onEdit: () => void;
  onOpenScene: (sceneId: string) => void;
  onSceneLinksChanged: () => Promise<unknown>;
  className?: string;
}) {
  type LinkedScene = {
    sceneId: string;
    sceneTitle: string;
    chapterTitle: string;
    volumeTitle: string;
  };
  const [linkedScenes, setLinkedScenes] = React.useState<LinkedScene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = React.useState("");
  const [sceneLinksLoading, setSceneLinksLoading] = React.useState(true);
  const [sceneLinkPending, setSceneLinkPending] = React.useState(false);
  const [sceneLinkError, setSceneLinkError] = React.useState("");
  const linkedSceneIds = React.useMemo(() => new Set(linkedScenes.map((scene) => scene.sceneId)), [linkedScenes]);
  const availableScenes = data.scenes.filter((scene) => !scene.archived && !linkedSceneIds.has(scene.id));
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
  const linkedPlaces = uniqueStrings(
    data.timelineEvents
      .filter((event) => event.characterIds.includes(character.id))
      .map((event) => placeName(event.locationId, data))
      .filter((place) => place !== "Unknown place")
  );
  const relationships = data.relationships
    .filter(
      (relationship) =>
        relationship.fromCharacterId === character.id ||
        relationship.toCharacterId === character.id
    )
    .map((relationship) => {
      const view = relationshipViewForCharacter(relationship, character.id);
      if (!view) return "";
      const other = data.characters.find((candidate) => candidate.id === view.otherCharacterId);
      return `${other?.name ?? "Unknown character"} — ${view.label}`;
    })
    .filter(Boolean);
  const valueOrFallback = (value: React.ReactNode) =>
    value === "" || value === null || value === undefined
      ? translate("Not specified")
      : value;

  return (
    <Card className={cn("surface-elevated xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto", className)}>
      <CardHeader>
        <div className="grid gap-4 sm:grid-cols-[90px_1fr]">
          <div className="grid size-[5.5rem] place-items-center rounded-xl border border-border/55 bg-surface-elevated text-primary shadow-paper-sm">
            <UserRound className="size-10" />
          </div>
          <div>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>{character.name}</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="size-4" /> {translate("Edit character")}
              </Button>
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
        <DetailSection title={translate("Identity")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLine label={translate("Age")} value={valueOrFallback(character.age)} />
            {character.narrativeStatus ? (
              <FieldLine label={translate("Narrative state")} value={translate(character.narrativeStatus)} />
            ) : null}
            <FieldLine
              label={translate("First appearance")}
              value={valueOrFallback(character.firstAppearance)}
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
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${translate("Open scene in editor")}: ${scene.sceneTitle}`}
                    onClick={() => onOpenScene(scene.sceneId)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{scene.sceneTitle}</span><ExternalLink className="size-3 shrink-0" /></span>
                    <span className="block truncate text-xs text-muted-foreground">{scene.volumeTitle} · {scene.chapterTitle}</span>
                  </button>
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
            <FieldLine
              label={translate("Linked places")}
              value={linkedPlaces.length ? linkedPlaces.join(", ") : translate("No linked places yet")}
            />
            <FieldLine
              label={translate("Relationships")}
              value={relationships.length ? relationships.join(", ") : translate("None yet")}
            />
          </div>
        </DetailSection>
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
