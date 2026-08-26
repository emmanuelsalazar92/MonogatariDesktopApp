"use client";

import {
  BadgeCheck,
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
import { estimateReadingMinutes, getDailyWritingMetrics } from "@/lib/writing-metrics";
import {
  CoverBlock,
  FieldLine,
  MetricCard,
  ProgressBar,
  StatusBadge
} from "@/components/studio/shared";

const dashboardActions = [
  { label: "New novel", icon: Library, page: "library" as PageId },
  { label: "Continue writing", icon: PenLine, page: "editor" as PageId },
  { label: "Open reader", icon: BookOpen, page: "reader" as PageId },
  { label: "Export latest version", icon: Download, page: "export" as PageId }
];

export function DashboardScreen({
  data,
  translate,
  dailyWordGoal,
  onSelectPage,
  onOpenNovel
}: {
  data: StudioData;
  translate: (value: string) => string;
  dailyWordGoal: string;
  onSelectPage: (page: PageId) => void;
  onOpenNovel: (novelId: string, nextPage?: PageId) => void;
}) {
  const currentNovel = getCurrentNovel(data);
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
        <Button variant="outline" className="shrink-0" onClick={() => onOpenNovel(currentNovel.id, "overview")}>
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
              {formatNumber(dailyMetrics.wordsToday)} / {formatNumber(dailyMetrics.dailyGoal)} {translate("words")}
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
              <Badge variant="accent">{dailyMetrics.progressPercent}%</Badge>
            </div>
            <ProgressBar value={dailyMetrics.progressPercent} />
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

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>{translate("Recent novels")}</CardTitle>
            <CardDescription>{translate("Local projects edited on this device")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {data.novels.slice(0, 3).map((novel) => (
              <button
                key={novel.id}
                type="button"
                onClick={() => onOpenNovel(novel.id, "overview")}
                className="grid gap-3 rounded-lg border border-border/55 bg-surface/68 p-3 text-left transition-all duration-150 hover:border-primary/35 hover:bg-surface-elevated hover:shadow-paper-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[auto_1fr_auto]"
              >
                <CoverBlock title={novel.title} compact />
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{novel.title}</h3>
                    <StatusBadge status={novel.status} translate={translate} />
                  </div>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {novel.synopsis}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <p>
                    {formatNumber(novel.wordCount)} {translate("words")}
                  </p>
                  <p>
                    {translate("Last edited")} {novel.updatedAt}
                  </p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>{translate("Quick actions")}</CardTitle>
              <CardDescription>{translate("Common local-first writing tasks")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2.5 sm:grid-cols-2">
              {dashboardActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="justify-start"
                    onClick={() => onSelectPage(action.page)}
                  >
                    <Icon className="size-4" />
                    {translate(action.label)}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>{translate("Local server status")}</CardTitle>
              <CardDescription>{translate("Accessible inside the home network")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border/55 bg-surface/72 p-3">
                <BadgeCheck className="size-5 text-primary" />
                <span className="font-medium">{translate("Running on local network")}</span>
              </div>
              <FieldLine label={translate("Local URL")} value="http://novel.local" />
              <FieldLine label={translate("IP URL")} value="http://192.168.1.50:3000" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
