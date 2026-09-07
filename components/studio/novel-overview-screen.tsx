"use client";

import Link from "next/link";
import {
  BookOpen,
  Boxes,
  Clock,
  FileText,
  ListTree,
  Network,
  PenLine,
  Pencil,
  Plus, LoaderCircle,
  UsersRound
} from "lucide-react";

import {
  CoverBlock,
  MapIcon,
  ProgressBar,
  TagList
} from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { formatNumber, getCurrentNovel, type StudioData } from "@/lib/studio-data";
import { getNovelSceneNavigation } from "@/lib/editor-scene-navigation";
import { routeForPage } from "@/lib/studio-routes";
import { storyOverviewMetrics } from "@/lib/story-overview-metrics";
import { currentNovelNotionStatus } from "@/lib/current-novel-notion-status";
import { getDailyWritingMetrics } from "@/lib/writing-metrics";
import { RecentActivityList } from "@/components/studio/recent-activity";

export function NovelOverviewScreen({
  data,
  translate,
  notionRootConfigured,
  notionSyncState,
  hasNotionConflict,
  hasRemoteChanges = false,
  syncing = false,
  navigationPending = false,
  onSyncNow,
  onReviewNotionChanges,
  onSelectPage,
  onOpenScene,
  onEditDetails
}: {
  data: StudioData;
  translate: (value: string) => string;
  notionRootConfigured: boolean;
  notionSyncState: StudioData["notionSyncStates"][number] | undefined;
  hasNotionConflict: boolean;
  hasRemoteChanges?: boolean;
  syncing?: boolean;
  navigationPending?: boolean;
  onSyncNow: () => void;
  onReviewNotionChanges: () => void;
  onSelectPage: (page: "structure" | "settings" | "characters" | "places" | "relationships" | "timeline" | "notes") => void;
  onOpenScene: (sceneId: string) => void;
  onEditDetails: () => void;
}) {
  const currentNovel = getCurrentNovel(data);
  const storedSyncStatus = currentNovelNotionStatus(notionSyncState, notionRootConfigured, hasNotionConflict);
  // A 409 from a manual sync is meaningful before the next snapshot returns.
  // Surface its safe recovery action immediately instead of requiring an F5.
  const syncStatus = hasRemoteChanges && storedSyncStatus.kind !== "conflict"
    ? { kind: "remote-changes" as const, lastSuccessfulSync: storedSyncStatus.lastSuccessfulSync }
    : storedSyncStatus;
  const lastSuccessfulSync = syncStatus.lastSuccessfulSync
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(syncStatus.lastSuccessfulSync))
    : null;
  const continuationScene = getNovelSceneNavigation(
    currentNovel.id,
    data.volumes,
    data.chapters,
    data.scenes
  ).at(-1);
  const metrics = storyOverviewMetrics(data);
  const dailyWriting = getDailyWritingMetrics(
    data.writingActivities,
    Number(data.studioSettings.dailyWordGoal)
  );
  const structureMetrics = [
    {
      label: translate("Total words"),
      value: formatNumber(metrics.wordCount),
      icon: FileText
    },
    { label: translate("Volumes"), value: formatNumber(metrics.volumeCount), icon: Boxes },
    { label: translate("Chapters"), value: formatNumber(metrics.chapterCount), icon: BookOpen },
    { label: translate("Scenes"), value: formatNumber(metrics.sceneCount), icon: ListTree }
  ];
  const storyBibleLinks = [
    { label: translate("Characters"), count: data.characters.length, icon: UsersRound, page: "characters" as const },
    { label: translate("Places"), count: data.locations.length, icon: MapIcon, page: "places" as const },
    { label: translate("Relationships"), count: data.relationships.length, icon: Network, page: "relationships" as const },
    { label: translate("Timeline events"), count: data.timelineEvents.length, icon: Clock, page: "timeline" as const },
    { label: translate("Notes"), count: data.overviewNotesCount, icon: FileText, page: "notes" as const }
  ];

  return (
    <div className="grid gap-6">
      <header className="surface-panel flex min-w-0 flex-col gap-4 rounded-lg px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
            {translate("Current novel")}
          </p>
          <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-normal text-foreground [overflow-wrap:anywhere] sm:text-3xl" title={currentNovel.title}>
            {currentNovel.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate("Last edited")} <time dateTime={currentNovel.updatedAt}>{currentNovel.updatedAt}</time>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {continuationScene ? (
            <Button asChild>
              <Link href={routeForPage("editor", currentNovel.id, continuationScene.id)} prefetch={false} aria-label={`${translate("Continue writing")}: ${currentNovel.title}`} aria-disabled={navigationPending} onClick={(event) => { event.preventDefault(); if (!navigationPending) onOpenScene(continuationScene.id); }}>
                <PenLine aria-hidden="true" className="size-4" />
                {translate("Continue writing")}
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={routeForPage("structure", currentNovel.id)} prefetch={false} aria-disabled={navigationPending} onClick={(event) => { event.preventDefault(); if (!navigationPending) onSelectPage("structure"); }}>
                <Plus aria-hidden="true" className="size-4" />
                {translate("Start in Structure")}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {!continuationScene ? (
        <p className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground" role="status">
          {translate("No editable scenes yet. Start in Structure to create one.")}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface/74 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between" aria-labelledby="notion-sync-heading" aria-live={syncStatus.kind === "error" ? "polite" : undefined}>
        <div className="min-w-0">
          <h2 id="notion-sync-heading" className="font-medium text-foreground">{translate("Notion sync")}</h2>
          {syncStatus.kind === "not-configured" ? <p>{translate("Notion is not configured for this studio.")}</p> : null}
          {syncStatus.kind === "local-only" ? <p>{translate("This novel is local only.")}</p> : null}
          {syncStatus.kind === "synced" ? <p>{translate("Synced")}{lastSuccessfulSync ? <> · {translate("Last successful sync")}: <time dateTime={syncStatus.lastSuccessfulSync ?? undefined}>{lastSuccessfulSync}</time></> : null}</p> : null}
          {syncStatus.kind === "pending" ? <p>{translate("Changes pending")}</p> : null}
          {syncStatus.kind === "syncing" ? <p>{translate("Syncing with Notion… You can keep writing.")}</p> : null}
          {syncStatus.kind === "remote-changes" ? <p>{translate("Remote changes detected. Review changes before continuing.")}</p> : null}
          {syncStatus.kind === "conflict" ? <p>{translate("A Notion conflict needs your review.")}</p> : null}
          {syncStatus.kind === "error" ? <p>{translate("Notion sync needs attention. Your local writing is safe.")}</p> : null}
        </div>
        {syncStatus.kind === "not-configured" || syncStatus.kind === "local-only" ? (
          <Button variant="outline" className="shrink-0" disabled={navigationPending} onClick={() => onSelectPage("settings")}>{translate("Open Settings")}</Button>
        ) : null}
        {syncStatus.kind === "pending" ? <Button type="button" variant="outline" className="shrink-0" disabled={syncing} aria-busy={syncing} onClick={onSyncNow}>{syncing ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Syncing…</> : translate("Sync now")}</Button> : null}
        {syncStatus.kind === "error" ? <Button type="button" variant="outline" className="shrink-0" disabled={syncing} aria-busy={syncing} onClick={onSyncNow}>{syncing ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Syncing…</> : translate("Retry")}</Button> : null}
        {syncStatus.kind === "remote-changes" ? <Button type="button" variant="outline" className="shrink-0" disabled={syncing} aria-busy={syncing} onClick={onReviewNotionChanges}>{syncing ? "Checking Notion…" : translate("Update from Notion")}</Button> : null}
        {syncStatus.kind === "conflict" ? <Button type="button" variant="outline" className="shrink-0" disabled={syncing} aria-busy={syncing} onClick={onReviewNotionChanges}>{syncing ? "Checking Notion…" : translate("Review conflict")}</Button> : null}
      </section>

      <div className="grid gap-4">
        <section className="surface-panel flex min-w-0 gap-3 rounded-lg p-3 sm:items-center sm:gap-4 sm:p-4" aria-labelledby="novel-details-heading">
          <CoverBlock title={currentNovel.title} coverImage={currentNovel.coverImage} compact />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 id="novel-details-heading" className="font-semibold text-foreground">{translate("Novel details")}</h2>
              <Button type="button" variant="outline" size="sm" onClick={onEditDetails}>
                <Pencil aria-hidden="true" className="size-3.5" />
                {translate("Edit details")}
              </Button>
            </div>
            <dl className="mt-3 grid min-w-0 gap-x-5 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{translate("Genre")}</dt>
                <dd className="mt-0.5 break-words text-foreground [overflow-wrap:anywhere]">{currentNovel.genre || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{translate("Tags")}</dt>
                <dd className="mt-1">{currentNovel.tags.length ? <TagList tags={currentNovel.tags} /> : <span className="text-foreground">—</span>}</dd>
              </div>
              {currentNovel.synopsis ? <div className="min-w-0 sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{translate("Synopsis")}</dt>
                <dd className="mt-0.5 line-clamp-2 break-words text-foreground [overflow-wrap:anywhere]">{currentNovel.synopsis}</dd>
              </div> : null}
            </dl>
          </div>
        </section>

        <RecentActivityList data={data} novelId={currentNovel.id} translate={translate} />

        <div className="grid gap-4">
          <Card className="surface-panel overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>{translate("Story structure")}</CardTitle>
              <CardDescription>{translate("Canonical structure for this novel")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {structureMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <Link
                    key={metric.label}
                    href={routeForPage("structure", currentNovel.id)}
                    prefetch={false}
                    aria-disabled={navigationPending}
                    onClick={(event) => { event.preventDefault(); onSelectPage("structure"); }}
                    aria-label={`${metric.value} ${metric.label}. ${translate("Open Structure")}`}
                    className="flex min-h-20 items-center gap-3 rounded-md border border-border/60 bg-surface/78 px-3 py-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-lg font-semibold tabular-nums text-foreground">{metric.value}</span>
                      <span className="block text-sm text-muted-foreground">{metric.label}</span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader className="pb-3">
              <CardTitle>{translate("Writing progress")}</CardTitle>
              <CardDescription>{translate("Verified from locally saved writing activity")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-surface/78 p-3">
                <p className="text-sm text-muted-foreground">{translate("Words today")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatNumber(dailyWriting.wordsToday)}</p>
              </div>
              {dailyWriting.dailyGoal !== null && dailyWriting.progressPercent !== null ? (
                <div className="rounded-md border border-border/60 bg-surface/78 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{translate("Daily writing goal")}</p>
                    <span className="text-sm font-medium tabular-nums text-foreground">{dailyWriting.progressPercent}%</span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatNumber(dailyWriting.wordsToday)} / {formatNumber(dailyWriting.dailyGoal)}</p>
                  <ProgressBar value={dailyWriting.progressPercent} label={translate("Daily writing goal")} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader className="pb-3">
              <CardTitle>{translate("Story Bible")}</CardTitle>
              <CardDescription>{translate("Open a project area")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {storyBibleLinks.map((item) => {
                const Icon = item.icon;
                const count = formatNumber(item.count);
                return (
                  <Link
                    key={item.page}
                    href={routeForPage(item.page, currentNovel.id)}
                    prefetch={false}
                    aria-disabled={navigationPending}
                    onClick={(event) => { event.preventDefault(); onSelectPage(item.page); }}
                    aria-label={`${count} ${item.label}`}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-border/60 bg-surface/78 px-3 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
