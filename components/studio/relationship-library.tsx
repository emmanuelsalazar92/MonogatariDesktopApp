"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchRelationshipTypes } from "@/lib/relationship-catalog";

export function RelationshipLibrary({ onChoose }: { onChoose: (type: string) => void }) {
  const [query, setQuery] = React.useState("");
  const results = searchRelationshipTypes(query);
  return <details className="min-w-0 rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold focus-visible:ring-2 focus-visible:ring-ring">Relationship types</summary>
    <div className="mt-3 space-y-3">
      <Label htmlFor="relationship-library-search">Search types by label or category</Label>
      <Input id="relationship-library-search" type="search" maxLength={120} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mentor of, Family…" />
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {results.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.map((type) => <li key={type.key}>
          <Button variant="outline" className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left" onClick={() => onChoose(type.key)} aria-label={`Add relationship: ${type.name}`}>
            <span className="font-semibold">{type.name}</span><span className="text-xs text-muted-foreground">{type.category} · {type.directionality}</span>
          </Button>
        </li>)}</ul> : <p role="status">No relationship types match this search.</p>}
      </div>
    </div>
  </details>;
}
