"use client";

import Link from "next/link";
import { notionStatusLabel } from "@/lib/notion-status";
import {
  BookOpen,
  Boxes,
  Download,
  FileText,
  Library,
  PenLine
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  formatNumber,
  getActiveChapter,
  getActiveScene,
  getCurrentNovel,
  placeName,
  type StudioData
} from "@/lib/studio-data";
import { type PageId } from "@/lib/studio-domain";
import { routeForPage } from "@/lib/studio-routes";
import { estimateReadingMinutes, getDailyWritingMetrics } from "@/lib/writing-metrics";
import {
  CoverBlock,
  FieldLine,
  MetricCard,
  ProgressBar,
  StatusBadge
} from "@/components/studio/shared";

export function DashboardScreen({
  data,
  translate,
  dailyWordGoal,
  onSelectPage,
  onOpenNovel,
  onCreateNovel,
  notionSyncState,
  notionAutosyncStatus,
  notionPublishState,
  navigationPending = false
}: {
  data: StudioData;
  translate: (value: string) => string;
  dailyWordGoal: string;
  onSelectPage: (page: PageId) => void;
  onOpenNovel: (novelId: string, nextPage?: PageId) => void;
  onCreateNovel: () => void;
  notionSyncState?: StudioData["notionSyncStates"][number];
  notionAutosyncStatus?: string;
  notionPublishState?: string;
  navigationPending?: boolean;
}) {
  const currentNovel = getCurrentNovel(data);
  const syncLabel = notionStatusLabel(notionSyncState, currentNovel.id, notionAutosyncStatus, notionPublishState);
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);
  const dailyMetrics = getDailyWritingMetrics(
    data.writingActivities,
    Number(dailyWordGoal)
  );
  const stats = [
    {
      label: translate("Total words"),
      value: formatNumber(currentNovel.wordCount),
      icon: FileText
    },
    { label: translate("Chapters"), value: String(data.chapters.length), icon: BookOpen },
    { label: translate("Scenes"), value: String(data.scenes.length), icon: Boxes },
    {
      label: translate("Words today"),
      value: formatNumber(dailyMetrics.wordsToday),
      icon: PenLine
    }
  ];

  return (
    <div className="grid gap-5 sm:gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/70 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {translate("Current Novel")}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {currentNovel.title}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {translate("Last edited chapter")}: {activeChapter.title}
          </p>
        </div>
        <Button variant="outline" className="shrink-0" disabled={navigationPending} onClick={() => onOpenNovel(currentNovel.id, "overview")}>
          <Library className="size-4" />
          {translate("Current Novel")}
        </Button>
      </section>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-0 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={
                index < stats.length - 1
                  ? "border-b border-border/55 sm:[&:nth-child(2n+1)]:border-r xl:border-b-0 xl:border-r"
                  : ""
              }
            >
              <MetricCard {...stat} variant="segment" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="group relative overflow-hidden surface-panel transition-all duration-150 hover:border-primary/35 hover:shadow-paper focus-within:border-primary/55 focus-within:shadow-paper">
          <button
            type="button"
            disabled={navigationPending}
            aria-label={`${translate("Continue writing")}: ${activeScene.title}`}
            className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onSelectPage("editor")}
          />
          <CardHeader className="pointer-events-none relative z-0 border-b border-border/55 pb-5">
            <CardTitle>{translate("Continue writing")}</CardTitle>
            <CardDescription>
              {translate("Last edited chapter")}: {activeChapter.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="pointer-events-none relative z-0 grid gap-5 pt-5 md:grid-cols-[104px_1fr]">
            <CoverBlock title={currentNovel.title} compact />
            <div className="min-w-0 space-y-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={activeChapter.status} translate={translate} />
                  <Badge variant="outline">{translate("Saved")} 4 min ago</Badge>
                  <Badge variant="accent">{translate("Writing focus")}</Badge>
                </div>
                <h2 className="text-[1.8rem] font-semibold leading-tight text-foreground">
                  {activeScene.title}
                </h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                  {activeScene.summary || translate("Draft scenes, inspect story links, and keep the assembled chapter close at hand.")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldLine
                  label={translate("Word count")}
                  value={formatNumber(activeChapter.wordCount)}
                />
                <FieldLine
                  label={translate("Reading time")}
                  value={`${estimateReadingMinutes(activeChapter.wordCount)} min`}
                />
                <FieldLine
                  label={translate("Current place")}
                  value={placeName(activeScene.locationId, data)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                  <PenLine className="size-4" />
                  {translate("Continue writing")}
                </span>
                <Button
                  variant="outline"
                  className="pointer-events-auto relative z-20"
                  disabled={navigationPending}
                  onClick={() => onSelectPage("reader")}
                >
                  <BookOpen className="size-4" />
                  {translate("Reader preview")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-shell">
          <CardHeader className="pb-4">
            <CardTitle>{translate("Daily writing progress")}</CardTitle>
            <CardDescription>
              {dailyMetrics.dailyGoal === null
                ? `${formatNumber(dailyMetrics.wordsToday)} ${translate("words today")}`
                : `${formatNumber(dailyMetrics.wordsToday)} / ${formatNumber(dailyMetrics.dailyGoal)} ${translate("words")}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[2.6rem] font-semibold leading-none">
                  {formatNumber(dailyMetrics.wordsToday)}
                </p>
                <p className="text-sm text-muted-foreground">{translate("words today")}</p>
              </div>
              {dailyMetrics.progressPercent !== null ? <Badge variant="accent">{dailyMetrics.progressPercent}%</Badge> : null}
            </div>
            {dailyMetrics.progressPercent !== null ? <ProgressBar value={dailyMetrics.progressPercent} /> : null}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="text-muted-foreground">
                {translate("Scenes touched")} <span className="font-medium text-foreground">{dailyMetrics.scenesTouched}</span>
              </span>
              <span className="text-muted-foreground">
                {translate("Estimated writing time")} <span className="font-medium text-foreground">{dailyMetrics.estimatedWritingMinutes} min</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {syncLabel ? (
        <p role="status" aria-live="polite" className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Notion: {translate(syncLabel)}</span>
          {notionSyncState?.lastNotionSync ? <span>{translate("Last successful sync")}: <time dateTime={notionSyncState.lastNotionSync}>{notionSyncState.lastNotionSync.replace("T", " ").slice(0, 16)} UTC</time></span> : null}
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-4">
            <CardTitle>{translate("Recent novels")}</CardTitle>
            <CardDescription>{translate("Local projects edited on this device")}</CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-2">
            {data.novels.slice(0, 3).map((novel) => (
              <Link
                key={novel.id}
                href={routeForPage("overview", novel.id)}
                prefetch={false}
                className="grid min-w-0 gap-1.5 rounded-lg border border-border/55 bg-surface/68 px-3 py-3 text-left transition-colors hover:border-primary/35 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="min-w-0 flex-1 basis-48 break-words font-semibold [overflow-wrap:anywhere]">{novel.title}</h3>
                  <StatusBadge status={novel.status} translate={translate} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <p>
                    {formatNumber(novel.wordCount)} {translate("words")}
                  </p>
                  <p>
                    {translate("Last edited")} <time dateTime={novel.updatedAt}>{novel.updatedAt}</time>
                  </p>
                </div>
              </Link>
            ))}
            {!data.novels.length ? <p className="text-sm text-muted-foreground">{translate("No recent novels yet.")}</p> : null}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-4">
            <CardTitle>{translate("Quick actions")}</CardTitle>
            <CardDescription>{translate("Common local-first writing tasks")}</CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-wrap gap-2.5">
            <Button type="button" className="h-auto whitespace-normal text-left" onClick={onCreateNovel}>
              <Library aria-hidden="true" className="size-4" />
              {translate("New novel")}
            </Button>
            {currentNovel.id ? <Button type="button" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => onSelectPage("export")}>
              <Download aria-hidden="true" className="size-4" />
              {translate("Export center")}
            </Button> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
