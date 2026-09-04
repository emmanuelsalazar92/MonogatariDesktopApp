import { Button } from "@/components/ui/button";

export function TimelineEmptyState({ hasVisibleEvents, onAdd, onClear }: { hasVisibleEvents: boolean; onAdd: () => void; onClear: () => void }) {
  // Hidden-only and truly empty catalogs are intentionally indistinguishable.
  return <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
    <p role="status" className="font-semibold">{hasVisibleEvents ? "No timeline events match those filters" : "No timeline events yet"}</p>
    <Button onClick={hasVisibleEvents ? onClear : onAdd}>{hasVisibleEvents ? "Clear Filters" : "Add first event"}</Button>
  </div>;
}
