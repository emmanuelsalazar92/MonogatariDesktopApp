"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RelationshipActions } from "./relationship-actions";
import { relationshipSentence } from "@/lib/relationship-catalog";
import { resolveRelationshipSemantics } from "@/lib/character-relationship";
import { graphEdges, visibleGraphCharacters, type GraphCharacter } from "@/lib/relationship-graph";
import { relationshipSinceLabel, relationshipSinceHref, type RelationshipSinceOption } from "@/lib/relationship-since";
import { routeForCharacter } from "@/lib/studio-routes";
import type { Relationship } from "@/lib/studio-domain";

export function RelationshipDetail({ relationship, novelId, characters, showSpoilers, sinceOptions, onFocusCharacter, onChanged }: {
  relationship: Relationship; novelId: string; characters: GraphCharacter[]; showSpoilers: boolean;
  sinceOptions: RelationshipSinceOption[]; onFocusCharacter: (id: string) => void; onChanged: () => Promise<void>;
}) {
  const edge = graphEdges(novelId, characters, [relationship], showSpoilers)[0];
  if (!edge) return <p role="status">Relationship unavailable.</p>;
  const people = visibleGraphCharacters(novelId, characters, showSpoilers), names = new Map(people.map((c) => [c.id, c.name]));
  const semantics = resolveRelationshipSemantics(relationship.relationshipType, relationship.direction);
  const sinceHref = relationshipSinceHref(novelId, relationship, sinceOptions);
  return <>
    <h3 className="font-semibold">{relationshipSentence(names.get(edge.from)!, relationship.relationshipType, names.get(edge.to)!)}</h3>
    <p className="mt-2 text-sm">{edge.directional ? "Directional" : "Symmetric"}{relationship.isSpoiler ? " · Spoiler" : ""}{relationship.archivedAt ? " · Archived" : ""}</p>
    <div className="my-3 flex flex-wrap gap-3 text-sm">
      {[edge.from, edge.to].map((id) => <React.Fragment key={id}>
        <Button variant="outline" size="sm" className="h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]" onClick={() => onFocusCharacter(id)}>Focus {names.get(id)}</Button>
        <Link className="self-center text-primary underline focus-visible:ring-2 focus-visible:ring-ring" href={routeForCharacter(novelId, id)}>Open {names.get(id)}</Link>
      </React.Fragment>)}
    </div>
    <dl className="space-y-3 text-sm">
      <div><dt className="font-medium">Type</dt><dd>{semantics.name}</dd></div>
      <div><dt className="font-medium">Category</dt><dd>{semantics.category}</dd></div>
      <div><dt className="font-medium">Status</dt><dd>{relationship.status || "Not specified"}</dd></div>
      <div><dt className="font-medium">Since</dt><dd>{sinceHref ? <Link className="text-primary underline focus-visible:ring-2 focus-visible:ring-ring" href={sinceHref}>{relationshipSinceLabel(relationship, sinceOptions)}</Link> : relationshipSinceLabel(relationship, sinceOptions)}</dd></div>
      <div><dt className="font-medium">Description</dt><dd className="whitespace-pre-wrap">{relationship.description || "No description"}</dd></div>
      <div><dt className="font-medium">Continuity Notes</dt><dd className="whitespace-pre-wrap">{relationship.notes || "No continuity notes"}</dd></div>
    </dl>
    <RelationshipActions key={relationship.id} relationship={relationship} characters={people} sinceOptions={sinceOptions} onChanged={onChanged} />
  </>;
}
