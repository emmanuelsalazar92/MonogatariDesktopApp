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
import {
  CoverBlock,
  FieldLine,
  MapIcon,
  MetricCard,
  ProgressBar,
  SectionHeader,
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
  onSelectPage,
  onOpenNovel
}: {
  data: StudioData;
  translate: (value: string) => string;
  onSelectPage: (page: PageId) => void;
  onOpenNovel: (novelId: string, nextPage?: PageId) => void;
}) {
  const currentNovel = getCurrentNovel(data);
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);
  const stats = [
    {
      label: translate("Total words"),
      value: formatNumber(data.novels.reduce((total, novel) => total + novel.wordCount, 0)),
      icon: FileText
    },
    { label: translate("Chapters"), value: String(data.chapters.length), icon: BookOpen },
    { label: translate("Scenes"), value: String(data.scenes.length), icon: Boxes },
    { label: translate("Places"), value: String(data.locations.length), icon: MapIcon }
  ];

  return (
    <div className="grid gap-7">
      <SectionHeader
        eyebrow={translate("Private desk")}
        title={translate("Welcome back, writer")}
        description={translate(
          "Continue drafting, organize story material, and export local files from a calm workspace built for long writing sessions."
        )}
        action={
          <>
            <Button onClick={() => onSelectPage("editor")}>
              <PenLine className="size-4" />
              {translate("Continue")}
            </Button>
            <Button variant="outline" onClick={() => onSelectPage("library")}>
              <Library className="size-4" />
              {translate("Library")}
            </Button>
          </>
        }
      />

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
        <Card className="overflow-hidden surface-panel">
          <CardHeader className="border-b border-border/55 pb-5">
            <CardTitle>{translate("Continue writing")}</CardTitle>
            <CardDescription>
              {translate("Last edited chapter")}: {activeChapter.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 pt-5 md:grid-cols-[104px_1fr]">
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
                <FieldLine label={translate("Reading time")} value="34 min" />
                <FieldLine
                  label={translate("Current place")}
                  value={placeName(activeScene.locationId, data)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="lg" onClick={() => onSelectPage("editor")}>
                  <PenLine className="size-4" />
                  {translate("Open editor")}
                </Button>
                <Button variant="outline" onClick={() => onSelectPage("reader")}>
                  <BookOpen className="size-4" />
                  {translate("Reader preview")}
                </Button>
                <Button variant="ghost" onClick={() => onOpenNovel(currentNovel.id, "overview")}>
                  {translate("Current Novel")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-shell">
          <CardHeader className="pb-4">
            <CardTitle>{translate("Daily writing progress")}</CardTitle>
            <CardDescription>
              {translate("Goal")}: 1,500 {translate("words")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[2.6rem] font-semibold leading-none">1,126</p>
                <p className="text-sm text-muted-foreground">{translate("words today")}</p>
              </div>
              <Badge variant="accent">75%</Badge>
            </div>
            <ProgressBar value={75} />
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border border-border/55 bg-surface/70 px-3 py-2.5">
                <span className="text-muted-foreground">Scenes touched</span>
                <span className="font-medium text-foreground">2</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/55 bg-surface/70 px-3 py-2.5">
                <span className="text-muted-foreground">Writing time</span>
                <span className="font-medium text-foreground">18 min</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/55 bg-surface/70 px-3 py-2.5">
                <span className="text-muted-foreground">Notes added</span>
                <span className="font-medium text-foreground">3</span>
              </div>
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
                className="grid gap-3 rounded-lg border border-border/55 bg-surface/68 p-3 text-left transition-all duration-150 hover:border-border hover:bg-surface-elevated sm:grid-cols-[auto_1fr_auto]"
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
