import { Button } from "@/components/ui/button";
import { EmptyState, MapIcon } from "@/components/studio/shared";
import { placeCatalogEmptyState } from "@/lib/place-catalog";

export function PlaceCatalogEmptyState({ totalCount, resultCount, onlyArchived, onAddPlace, onClearFilters, onShowArchived }: {
  totalCount: number;
  resultCount: number;
  onlyArchived: boolean;
  onAddPlace: () => void;
  onClearFilters: () => void;
  onShowArchived: () => void;
}) {
  const state = placeCatalogEmptyState(totalCount, resultCount);
  if (!state) return null;
  return <div className="min-w-0 space-y-3">
    <EmptyState icon={MapIcon}
      title={state === "no-places" ? "No places yet" : "No places match those filters"}
      description={state === "no-places" ? "Add a place to start building your novel’s world." : onlyArchived ? "Your places are archived. Show archived places or adjust the filters." : "Adjust search, type, or status to find your places."}
    />
    <div className="flex flex-wrap justify-center gap-2">
      {state === "no-places" ? <Button type="button" onClick={onAddPlace}>Add your first place</Button> : <>
        <Button type="button" variant="outline" onClick={onClearFilters}>Clear filters</Button>
        {onlyArchived ? <Button type="button" onClick={onShowArchived}>Show archived places</Button> : null}
      </>}
    </div>
  </div>;
}
