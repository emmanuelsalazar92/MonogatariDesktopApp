"use client";

import { Grid2X2, Library, List, Plus, Search } from "lucide-react";

import { EmptyState, SectionHeader } from "@/components/studio/shared";
import { NovelProjectCard } from "@/components/studio/novel-project-card";
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
import { type Novel, type PageId } from "@/lib/studio-domain";
import { libraryNarrativeStatuses, librarySearchLimit, librarySortOptions, type LibraryLifecycle, type LibrarySort, type LibraryView } from "@/lib/studio-library-navigation";

type NovelMetricSummary = {
  volumeCount: number;
  chapterCount: number;
};

type NotionStatusSummary = {
  label: string;
  lastSuccessfulSync: string | null;
};

export function LibraryScreen({
  novels,
  totalNovelCount = novels.length,
  ready = true,
  loadError = false,
  genreOptions = ["All genres"],
  lifecycle = "active",
  onLifecycleChange,
  novelMetrics,
  writingTargets,
  activeNovelId,
  notionStatusByNovel = {},
  query,
  status,
  genre,
  sort,
  view,
  viewSaveDisabled = false,
  viewSaveMessage = "",
  navigationPending = false,
  navigationLabel = "",
  translate,
  onQueryChange,
  onStatusChange,
  onGenreChange,
  onSortChange,
  onViewChange,
  onClearFilters,
  onOpenDialog,
  onRetry,
  onSelectNovel,
  onExportNovel,
  onArchiveNovel,
  onRestoreNovel
}: {
  novels: Novel[];
  totalNovelCount?: number;
  ready?: boolean;
  loadError?: boolean;
  genreOptions?: string[];
  lifecycle?: LibraryLifecycle;
  onLifecycleChange?: (value: LibraryLifecycle) => void;
  novelMetrics: Record<string, NovelMetricSummary>;
  writingTargets: Record<string, string | undefined>;
  activeNovelId?: string;
  notionStatusByNovel?: Record<string, NotionStatusSummary | undefined>;
  query: string;
  status: string;
  genre: string;
  sort: LibrarySort;
  view: LibraryView;
  viewSaveDisabled?: boolean;
  viewSaveMessage?: string;
  navigationPending?: boolean;
  navigationLabel?: string;
  translate: (value: string) => string;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onSortChange: (value: LibrarySort) => void;
  onViewChange: (value: LibraryView) => void;
  onClearFilters: () => void;
  onOpenDialog: () => void;
  onRetry?: () => void;
  onSelectNovel?: (novelId: string, nextPage?: PageId, sceneId?: string) => void | Promise<void>;
  onExportNovel?: (novelId: string) => void | Promise<void>;
  onArchiveNovel?: (novel: Novel) => void;
  onRestoreNovel?: (novel: Novel) => void;
}) {
  return (
    <div className="grid min-w-0 gap-6">
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
        <CardContent className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              aria-label={translate("Search by title")}
              maxLength={librarySearchLimit}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={translate("Search by title")}
              className="pl-9"
            />
          </div>
          <Select value={lifecycle} onValueChange={(value) => onLifecycleChange?.(value as LibraryLifecycle)}>
            <SelectTrigger aria-label={translate("Project lifecycle")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{translate("Active")}</SelectItem>
              <SelectItem value="archived">{translate("Archived")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={onStatusChange} disabled={lifecycle === "archived"}>
            <SelectTrigger aria-label={translate("Narrative status")} title={lifecycle === "archived" ? translate("Archived projects use the Archived status in the current model.") : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {libraryNarrativeStatuses.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {genreOptions.length > 1 ? <Select value={genre} onValueChange={onGenreChange}>
            <SelectTrigger aria-label={translate("Genre")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {genreOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select> : null}
          <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
            <SelectTrigger aria-label={translate("Sort novels")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {librarySortOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {translate(
                    item === "updated"
                      ? "Last edited"
                      : item === "created"
                        ? "Created"
                        : item === "words" ? "Word count" : "Title"
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={translate("Library view")}>
            <Button
              variant={view === "grid" ? "secondary" : "outline"}
              type="button"
              disabled={viewSaveDisabled}
              aria-label={translate("Grid view")}
              aria-pressed={view === "grid"}
              onClick={() => onViewChange("grid")}
            >
              <Grid2X2 className="size-4" />
              {translate("Grid")}
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "outline"}
              type="button"
              disabled={viewSaveDisabled}
              aria-label={translate("List view")}
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
            >
              <List className="size-4" />
              {translate("List")}
            </Button>
            <Button variant="ghost" type="button" onClick={onClearFilters}>
              {translate("Clear filters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {viewSaveMessage ? <p role="status" className="text-sm text-muted-foreground">{translate(viewSaveMessage)}</p> : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
        {ready ? `${novels.length} / ${totalNovelCount} ${translate("novels shown")}` : loadError ? translate("Library could not be loaded.") : translate("Loading library...")}
      </p>

      {!ready ? loadError ? (
        <EmptyState
          icon={Library}
          title={translate("Library could not be loaded.")}
          description={translate("Your local projects are unchanged. Try loading the local Library again.")}
          action={onRetry ? <Button type="button" variant="outline" onClick={onRetry}>{translate("Retry")}</Button> : undefined}
        />
      ) : null : novels.length ? (
        <div className={view === "list" ? "grid min-w-0 gap-2" : "grid min-w-0 gap-4 lg:grid-cols-2"}>
          {novels.map((novel) => (
            <NovelProjectCard
              key={novel.id}
              novel={novel}
              metrics={novelMetrics[novel.id]}
              writingSceneId={writingTargets[novel.id]}
              view={view}
              isCurrent={novel.id === activeNovelId}
              notionStatus={notionStatusByNovel[novel.id]?.label}
              lastSuccessfulNotionSync={notionStatusByNovel[novel.id]?.lastSuccessfulSync}
              onSelectNovel={onSelectNovel}
              onExportNovel={novel.status === "Archived" ? undefined : onExportNovel}
              onArchiveNovel={onArchiveNovel}
              onRestoreNovel={onRestoreNovel}
              navigationPending={navigationPending}
              navigationLabel={navigationLabel}
              translate={translate}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <EmptyState
          icon={Library}
          title={translate(totalNovelCount === 0 ? "No novels yet" : lifecycle === "archived" ? "No archived novels" : "No novels match these filters")}
          description={translate(totalNovelCount === 0 ? "Create your first novel to begin writing." : lifecycle === "archived" ? "Archived projects will appear here and can be restored at any time." : "Try clearing one filter or searching by a shorter title fragment.")}
        />
          <Button variant="outline" className="justify-self-center" onClick={totalNovelCount === 0 ? onOpenDialog : lifecycle === "archived" ? () => onLifecycleChange?.("active") : onClearFilters}>
            {translate(totalNovelCount === 0 ? "New novel" : lifecycle === "archived" ? "View active novels" : "Clear filters")}
          </Button>
        </div>
      )}
    </div>
  );
}
