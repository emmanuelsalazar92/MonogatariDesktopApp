"use client";

import { Archive, Download, Grid2X2, Library, List, Plus, Search } from "lucide-react";

import { EmptyState, FieldLine, SectionHeader, StatusBadge, CoverBlock } from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatNumber } from "@/lib/studio-data";
import { genreFilters, statusFilters, type Novel, type PageId } from "@/lib/studio-domain";
import { librarySortOptions, type LibrarySort, type LibraryView } from "@/lib/studio-library-navigation";

type NovelMetricSummary = {
  volumeCount: number;
  chapterCount: number;
};

export function LibraryScreen({
  novels,
  novelMetrics,
  query,
  status,
  genre,
  sort,
  view,
  translate,
  onQueryChange,
  onStatusChange,
  onGenreChange,
  onSortChange,
  onViewChange,
  onClearFilters,
  onOpenNovel,
  onOpenDialog
}: {
  novels: Novel[];
  novelMetrics: Record<string, NovelMetricSummary>;
  query: string;
  status: string;
  genre: string;
  sort: LibrarySort;
  view: LibraryView;
  translate: (value: string) => string;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onSortChange: (value: LibrarySort) => void;
  onViewChange: (value: LibraryView) => void;
  onClearFilters: () => void;
  onOpenNovel: (novelId: string, nextPage?: PageId) => void;
  onOpenDialog: () => void;
}) {
  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={translate("Library")}
        title={translate("Novel projects")}
        description={translate(
          "Browse private novels, filter by stage or genre, and continue work from the latest local draft."
        )}
        action={
          <Button onClick={onOpenDialog}>
            <Plus className="size-4" />
            {translate("New novel")}
          </Button>
        }
      />

      <Card className="surface-panel">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px_190px_150px_auto] lg:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={translate("Search by title")}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFilters.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genre} onValueChange={onGenreChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {genreFilters.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
            <SelectTrigger aria-label={translate("Sort novels")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {librarySortOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(
                    item === "updated"
                      ? "Recently updated"
                      : item === "created"
                        ? "Recently created"
                        : "Title"
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button
              variant={view === "grid" ? "secondary" : "outline"}
              size="icon"
              type="button"
              aria-label={translate("Grid view")}
              aria-pressed={view === "grid"}
              onClick={() => onViewChange("grid")}
            >
              <Grid2X2 className="size-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "outline"}
              size="icon"
              type="button"
              aria-label={translate("List view")}
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
            >
              <List className="size-4" />
            </Button>
            <Button variant="ghost" type="button" onClick={onClearFilters}>
              {translate("Clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {novels.length ? (
        <div className={view === "list" ? "grid gap-4" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
          {novels.map((novel) => (
            <Card key={novel.id} className="surface-panel overflow-hidden">
              <CardContent className="grid gap-5 p-5">
                <div className="grid gap-4 sm:grid-cols-[88px_1fr]">
                  <CoverBlock title={novel.title} compact />
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-[1.15rem] font-semibold">{novel.title}</h2>
                        <p className="text-sm text-muted-foreground">{translate(novel.genre)}</p>
                      </div>
                      <StatusBadge status={novel.status} translate={translate} />
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {novel.synopsis}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <FieldLine
                        label={translate("Volumes")}
                        value={novelMetrics[novel.id]?.volumeCount ?? 0}
                      />
                      <FieldLine
                        label={translate("Chapters")}
                        value={novelMetrics[novel.id]?.chapterCount ?? 0}
                      />
                      <FieldLine
                        label={translate("Words")}
                        value={formatNumber(novel.wordCount)}
                      />
                      <FieldLine label={translate("Last edited")} value={novel.updatedAt} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" onClick={() => onOpenNovel(novel.id, "overview")}>
                        {translate("Open")}
                      </Button>
                      <Button onClick={() => onOpenNovel(novel.id, "editor")}>
                        {translate("Continue")}
                      </Button>
                      <Button variant="ghost">
                        <Download className="size-4" />
                        {translate("Export")}
                      </Button>
                      <Button variant="ghost">
                        <Archive className="size-4" />
                        {translate("Archive")}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Library}
          title={translate("No novels match those filters")}
          description={translate(
            "Try clearing one filter or searching by a shorter title fragment."
          )}
        />
      )}
    </div>
  );
}
