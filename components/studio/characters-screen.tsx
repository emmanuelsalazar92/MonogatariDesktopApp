"use client";

import { Plus, Search, UserRound } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  characterName,
  placeName,
  uniqueStrings,
  type StudioData
} from "@/lib/studio-data";
import { type Character } from "@/lib/studio-domain";

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
  onAddCharacter
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
}) {
  const selectedCharacter = characters[0] ?? null;

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
        {characters.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                data={data}
                translate={translate}
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

        {selectedCharacter ? (
          <CharacterDetailPanel
            character={selectedCharacter}
            data={data}
            translate={translate}
          />
        ) : null}
      </div>
    </div>
  );
}

function CharacterCard({
  character,
  data,
  translate
}: {
  character: Character;
  data: StudioData;
  translate: (value: string) => string;
}) {
  const relatedNames =
    data.relationships
      .filter(
        (relationship) =>
          relationship.fromCharacterId === character.id ||
          relationship.toCharacterId === character.id
      )
      .map((relationship) =>
        relationship.fromCharacterId === character.id
          ? characterName(relationship.toCharacterId, data)
          : characterName(relationship.fromCharacterId, data)
      )
      .join(", ") || translate("None yet");

  return (
    <Card className="surface-panel">
      <CardContent className="grid gap-4 p-5 sm:grid-cols-[72px_1fr]">
        <div className="grid size-[4.5rem] place-items-center rounded-xl border border-border/55 bg-surface-elevated text-primary shadow-paper-sm">
          <UserRound className="size-8" />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{character.name}</h3>
              <p className="truncate text-sm text-muted-foreground">{character.alias}</p>
            </div>
            <StatusBadge status={character.status} translate={translate} />
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <FieldLine label={translate("Role")} value={translate(character.role)} />
            <FieldLine label={translate("Age")} value={character.age} />
            <FieldLine
              label={translate("First appearance")}
              value={character.firstAppearance}
            />
            <FieldLine label={translate("Scenes")} value={character.scenes} />
          </div>
          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
            {character.personality}
          </p>
          <p className="rounded-lg bg-surface/72 px-3 py-2.5 text-sm text-muted-foreground">
            {translate("Related characters")}: {relatedNames}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CharacterDetailPanel({
  character,
  data,
  translate
}: {
  character: Character;
  data: StudioData;
  translate: (value: string) => string;
}) {
  const linkedPlaces = uniqueStrings(
    data.timelineEvents
      .filter((event) => event.characterIds.includes(character.id))
      .map((event) => placeName(event.locationId, data))
      .filter((place) => place !== "Unknown place")
  );

  return (
    <Card className="surface-elevated xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <CardHeader>
        <div className="grid gap-4 sm:grid-cols-[90px_1fr]">
          <div className="grid size-[5.5rem] place-items-center rounded-xl border border-border/55 bg-surface-elevated text-primary shadow-paper-sm">
            <UserRound className="size-10" />
          </div>
          <div>
            <CardTitle>{character.name}</CardTitle>
            <CardDescription>{character.alias}</CardDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={character.status} translate={translate} />
              <Badge variant="outline">{translate(character.role)}</Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FieldLine label={translate("Age")} value={character.age} />
        <FieldLine label={translate("Appearance")} value={character.appearance} />
        <FieldLine label={translate("Personality")} value={character.personality} />
        <FieldLine label={translate("Way of speaking")} value={character.wayOfSpeaking} />
        <FieldLine label={translate("Goal")} value={character.goal} />
        <FieldLine label={translate("Fear")} value={character.fear} />
        <FieldLine label={translate("Secret")} value={character.secret} />
        <FieldLine label={translate("Notes")} value={character.notes} />
        <FieldLine label={translate("First appearance")} value={character.firstAppearance} />
        <FieldLine
          label={translate("Linked scenes")}
          value={`${character.scenes} ${translate("Scenes").toLowerCase()}`}
        />
        <FieldLine
          label={translate("Linked places")}
          value={
            linkedPlaces.length
              ? linkedPlaces.join(", ")
              : translate("No linked places yet")
          }
        />
        <FieldLine
          label={translate("Relationships")}
          value={
            data.relationships
              .filter(
                (relationship) =>
                  relationship.fromCharacterId === character.id ||
                  relationship.toCharacterId === character.id
              )
              .map((relationship) => relationship.relationshipType)
              .join(", ") || translate("None yet")
          }
        />
      </CardContent>
    </Card>
  );
}
