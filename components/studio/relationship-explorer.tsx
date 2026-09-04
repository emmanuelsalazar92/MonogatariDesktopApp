"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RelationshipGraph } from "./relationship-graph";
import { RelationshipDetail } from "./relationship-detail";
import { RelationshipDetailLoader } from "./relationship-loaders";
import { relationshipSentence } from "@/lib/relationship-catalog";
import { graphEdges, layoutRelationshipGraph, visibleGraphCharacters, type GraphCharacter } from "@/lib/relationship-graph";
import type { RelationshipSinceOption } from "@/lib/relationship-since";
import { routeForCharacter } from "@/lib/studio-routes";
import type { RelationshipSummary } from "@/lib/studio-domain";

const PAGE_SIZE = 20;
export function RelationshipExplorer({ novelId, characters, relationships, showSpoilers, focusId, sinceOptions, onFocusCharacter, onChanged, onClearFilters }: {
  novelId: string; characters: GraphCharacter[]; relationships: RelationshipSummary[]; showSpoilers: boolean;
  focusId: string; sinceOptions: RelationshipSinceOption[];
  onFocusCharacter: (id: string) => void; onChanged: () => Promise<void>; onClearFilters: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const [narrow, setNarrow] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const detailRef = React.useRef<HTMLElement>(null), headingRef = React.useRef<HTMLHeadingElement>(null);
  const listRef = React.useRef<HTMLElement>(null), invoker = React.useRef<HTMLElement | null>(null);
  const [focusRequest, setFocusRequest] = React.useState(0);
  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const visibleCharacters = React.useMemo(() => visibleGraphCharacters(novelId, characters, showSpoilers), [novelId, characters, showSpoilers]);
  const edges = React.useMemo(() => graphEdges(novelId, characters, relationships, showSpoilers), [novelId, characters, relationships, showSpoilers]);
  const model = React.useMemo(() => layoutRelationshipGraph(visibleCharacters, edges, focusId), [visibleCharacters, edges, focusId]);
  const names = new Map(visibleCharacters.map((c) => [c.id, c.name]));
  const selectedEdge = edges.find((edge) => edge.id === selectedId);
  const selected = selectedEdge ? relationships.find((r) => r.id === selectedEdge.id) : null;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(edges.length / PAGE_SIZE) - 1));
  const select = (id: string) => {
    const index = edges.findIndex((e) => e.id === id);
    if (index < 0) return;
    invoker.current = document.activeElement as HTMLElement | null;
    setSelectedId(id); setDrawerOpen(true); setPage(Math.floor(index / PAGE_SIZE)); setFocusRequest((value) => value + 1);
  };
  React.useEffect(() => {
    if (focusRequest && !narrow) detailRef.current?.focus({ preventScroll: false });
  }, [focusRequest, narrow]);
  React.useEffect(() => {
    if (focusId !== "All characters") headingRef.current?.focus({ preventScroll: true });
  }, [focusId]);
  const topologyKey = JSON.stringify([model.egoId, model.nodes.map((n) => n.id), model.edges.map((e) => [e.id, e.from, e.to])]);
  const detail = selected ? <RelationshipDetailLoader key={selected.id} summary={selected} showSpoilers={showSpoilers}>
    {(relationship) => <RelationshipDetail relationship={relationship} novelId={novelId} characters={characters} showSpoilers={showSpoilers} sinceOptions={sinceOptions} onFocusCharacter={onFocusCharacter} onChanged={onChanged} />}
  </RelationshipDetailLoader> : <p className="text-sm text-muted-foreground">Select a line in the graph or a relationship in the list to read its details.</p>;
  return <section className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start" aria-label="Relationship map and list">
    <div className="min-w-0 rounded-lg border bg-card p-4 lg:col-start-1">
      <h2 ref={headingRef} tabIndex={-1} className="mb-3 text-lg font-semibold focus-visible:ring-2 focus-visible:ring-ring">Relationship map</h2>
      {model.egoId ? <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span>Network centered on {names.get(model.egoId)}</span>
        <Link className="text-primary underline focus-visible:ring-2 focus-visible:ring-ring" href={routeForCharacter(novelId, model.egoId)}>Open Character</Link>
        {focusId !== "All characters" ? <Button size="sm" variant="outline" onClick={() => onFocusCharacter("All characters")}>All characters</Button> : null}
      </div> : null}
      <RelationshipGraph key={topologyKey} model={model} selectedId={selectedEdge?.id ?? null} onSelectEdge={select} onSelectCharacter={onFocusCharacter} />
    </div>
    <section ref={listRef} tabIndex={-1} className="min-w-0 rounded-lg border bg-card p-4 focus-visible:ring-2 focus-visible:ring-ring lg:col-start-1 lg:row-start-2" aria-label="Complete filtered relationship list">
      <h2 className="text-lg font-semibold">Relationships · {edges.length}</h2>
      <p className="mb-3 text-sm text-muted-foreground">All relationships matching the current filters, including those outside the graph.</p>
      {!edges.length ? <div className="space-y-3"><p>No visible relationships match these filters.</p><Button variant="outline" onClick={onClearFilters}>Clear filters</Button></div> : <ul className="space-y-2">
        {edges.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((edge) => <li key={edge.id}>
          <button type="button" aria-pressed={selectedId === edge.id} onClick={() => select(edge.id)} className="w-full rounded-md border p-3 text-left text-sm [overflow-wrap:anywhere] hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-secondary">
            {relationshipSentence(names.get(edge.from)!, edge.label, names.get(edge.to)!)}
          </button>
        </li>)}
      </ul>}
      {edges.length > PAGE_SIZE ? <nav className="mt-3 flex flex-wrap items-center gap-3" aria-label="Relationship list pages">
        <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <span role="status">Page {currentPage + 1} of {Math.ceil(edges.length / PAGE_SIZE)}</span>
        <Button variant="outline" size="sm" disabled={(currentPage + 1) * PAGE_SIZE >= edges.length} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </nav> : null}
    </section>
    {narrow ? <Dialog open={drawerOpen && Boolean(selected)} onOpenChange={setDrawerOpen}>
      <DialogContent className="relationship-detail-drawer" onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (invoker.current?.isConnected) invoker.current.focus(); else listRef.current?.focus();
      }}>
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>Relationship detail</DialogTitle>
          <DialogDescription>Read this relationship or return to the map and list.</DialogDescription>
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>Back to relationships</Button>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere]">{detail}</div>
      </DialogContent>
    </Dialog> : <section ref={detailRef} tabIndex={-1} aria-label="Relationship detail" className="min-w-0 self-start rounded-lg border bg-card p-4 focus-visible:ring-2 focus-visible:ring-ring lg:col-start-2 lg:row-span-2 lg:row-start-1">
      <h2 className="mb-3 text-lg font-semibold">Relationship detail</h2>{detail}
    </section>}
  </section>;
}
