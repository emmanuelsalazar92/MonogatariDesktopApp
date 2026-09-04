"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { fitGraph, graphEdgeGeometry, zoomGraph, type GraphCamera, type GraphModel } from "@/lib/relationship-graph";

export function RelationshipGraph({ model, selectedId, onSelectEdge, onSelectCharacter }: {
  model: GraphModel; selectedId: string | null;
  onSelectEdge: (id: string) => void; onSelectCharacter: (id: string) => void;
}) {
  const svg = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ width: 720, height: 400 });
  const [camera, setCamera] = React.useState<GraphCamera | null>(null);
  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const markerId = `relationship-arrow-${React.useId().replace(/:/g, "")}`;
  const helpId = `${markerId}-help`;
  const nodes = model.nodes.length === 2 && size.width < 480
    ? model.nodes.map((node, index) => ({ ...node, x: 0, y: index * 220 - 110 })) : model.nodes;
  const geometry = model.edges.map((edge) => ({ edge, ...graphEdgeGeometry(edge, nodes, model.edges) }));
  const bounds = [...nodes, ...geometry.map((g) => ({ id: g.edge.id, name: "", x: g.x, y: g.y }))];
  const fitted = fitGraph(bounds, size.width, size.height);
  const view = camera ?? fitted;
  React.useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        setCamera(null);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const zoom = (factor: number) => setCamera(zoomGraph(view, factor, size.width / 2, size.height / 2));
  const pan = (x: number, y: number) => setCamera({ ...view, x: view.x + x, y: view.y + y });
  const activate = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
  };
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Graph controls">
      <Button size="sm" variant="outline" onClick={() => zoom(1.25)} aria-label="Zoom in">+</Button>
      <Button size="sm" variant="outline" onClick={() => zoom(0.8)} aria-label="Zoom out">−</Button>
      <Button size="sm" variant="outline" onClick={() => setCamera(null)}>Reset / Fit</Button>
      <Button size="sm" variant="ghost" aria-label="Pan left" onClick={() => pan(-60, 0)}>←</Button>
      <Button size="sm" variant="ghost" aria-label="Pan right" onClick={() => pan(60, 0)}>→</Button>
      <Button size="sm" variant="ghost" aria-label="Pan up" onClick={() => pan(0, -60)}>↑</Button>
      <Button size="sm" variant="ghost" aria-label="Pan down" onClick={() => pan(0, 60)}>↓</Button>
    </div>
    <p id={helpId} className="text-xs text-muted-foreground">Select a character to focus its network; select a line to read the relationship. Drag empty space to pan. Use + / − to zoom. The complete filtered list is below the graph.</p>
    {!model.edges.length ? <p role="status" className="rounded-lg border bg-editor p-6">No visible relationships match these filters. Adjust the filters or add a relationship.</p> : <svg
      ref={svg} role="group" aria-label="Interactive relationship graph" aria-describedby={helpId} tabIndex={0}
      className="relationship-graph block h-[min(55dvh,440px)] min-h-64 w-full touch-none rounded-lg border bg-editor focus-visible:ring-2 focus-visible:ring-ring"
      viewBox={`0 0 ${size.width} ${size.height}`}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "+" || event.key === "=") zoom(1.25);
        else if (event.key === "-") zoom(0.8);
        else if (event.key === "Home") setCamera(null);
        else if (event.key.startsWith("Arrow")) {
          event.preventDefault(); pan(event.key === "ArrowLeft" ? -60 : event.key === "ArrowRight" ? 60 : 0, event.key === "ArrowUp" ? -60 : event.key === "ArrowDown" ? 60 : 0);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("[data-graph-item]")) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const previous = drag.current;
        if (!previous || previous.id !== event.pointerId) return;
        pan(event.clientX - previous.x, event.clientY - previous.y);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    >
      <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {geometry.map(({ edge, path, x, y }) => {
          const selected = selectedId === edge.id;
          const from = model.nodes.find((n) => n.id === edge.from)!.name, to = model.nodes.find((n) => n.id === edge.to)!.name;
          return <g key={edge.id} data-graph-item="edge" role="button" tabIndex={0} aria-pressed={selected}
            aria-label={`${from} ${edge.label} ${to}${edge.directional ? ", directional" : ", symmetric"}`}
            className="graph-edge cursor-pointer" onClick={() => onSelectEdge(edge.id)} onKeyDown={(event) => activate(event, () => onSelectEdge(edge.id))}>
            <title>{`${from} ${edge.label} ${to}`}</title>
            <path d={path} fill="none" stroke="transparent" strokeWidth="22" />
            <path className="graph-edge-line" d={path} fill="none" stroke={selected ? "rgb(var(--primary))" : "rgb(var(--foreground))"} strokeWidth={selected ? 3.5 : 2} markerEnd={edge.directional ? `url(#${markerId})` : undefined} />
            <rect x={x - 82} y={y - 14} width="164" height="28" rx="6" fill="rgb(var(--card))" stroke={selected ? "rgb(var(--primary))" : "rgb(var(--border))"} />
            <text x={x} y={y + 4} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="12">{edge.label.length > 23 ? `${edge.label.slice(0, 22)}…` : edge.label}</text>
          </g>;
        })}
        {nodes.map((node) => <g key={node.id} data-graph-item="node" role="button" tabIndex={0} aria-label={`Focus character: ${node.name}`} aria-pressed={node.id === model.egoId}
          className="graph-node cursor-pointer" transform={`translate(${node.x} ${node.y})`} onClick={() => onSelectCharacter(node.id)} onKeyDown={(event) => activate(event, () => onSelectCharacter(node.id))}>
          <title>{node.name}</title>
          <rect x="-80" y="-26" width="160" height="52" rx="12" fill="rgb(var(--card))" stroke={node.id === model.egoId ? "rgb(var(--primary))" : "rgb(var(--foreground))"} strokeWidth="2" />
          <text textAnchor="middle" y="5" fill="rgb(var(--foreground))" fontSize="14" fontWeight="600">{node.name.length > 19 ? `${node.name.slice(0, 18)}…` : node.name}</text>
        </g>)}
      </g>
    </svg>}
    <p role="status" className="text-sm text-muted-foreground">{model.nodes.length} characters · {model.edges.length} of {model.total} visible relationships in graph.{model.limited ? " Limited to an ego-network (18 characters / 36 links maximum). Choose another character or use the complete list." : ""}</p>
  </div>;
}
