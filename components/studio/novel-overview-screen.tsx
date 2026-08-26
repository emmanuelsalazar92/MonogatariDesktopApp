"use client";

import {
  BookOpen,
  Boxes,
  Clock,
  Download,
  FileText,
  Home,
  ListTree,
  Network,
  PenLine,
  Plus,
  Upload,
  UserRound,
  UsersRound
} from "lucide-react";

import {
  CoverBlock,
  FieldLine,
  MapIcon,
  MetricCard,
  ProgressBar,
  SectionHeader,
  StatusBadge,
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
import { type PageId } from "@/lib/studio-domain";

type NotionPublishState = "idle" | "publishing" | "success" | "error";
type NotionAutosyncStatus = "idle" | "syncing" | "synced" | "error" | "remote-changes";

export function NovelOverviewScreen({
  data,
  translate,
  onSelectPage,
  onPublishToNotion,
  onPullFromNotion,
  notionPublishState,
  notionPublishMessage,
  notionPublishUrl,
  notionRootConfigured,
  notionSyncState,
  notionAutosyncStatus
}: {
  data: StudioData;
  translate: (value: string) => string;
  onSelectPage: (page: PageId) => void;
  onPublishToNotion: () => void;
  onPullFromNotion: () => void;
  notionPublishState: NotionPublishState;
  notionPublishMessage: string;
  notionPublishUrl: string;
  notionRootConfigured: boolean;
  notionSyncState: StudioData["notionSyncStates"][number] | undefined;
  notionAutosyncStatus: NotionAutosyncStatus;
}) {
  const currentNovel = getCurrentNovel(data);
  const statusLabel =
    notionAutosyncStatus === "remote-changes"
      ? "Remote changes detected"
      : notionAutosyncStatus === "syncing" || notionPublishState === "publishing"
      ? "Syncing Notion"
      : notionAutosyncStatus === "error" || notionPublishState === "error"
        ? "Sync error"
        : notionAutosyncStatus === "synced" || notionPublishState === "success"
          ? "Synced"
          : "Local saved";
  const stats = [
    {
      label: translate("Total words"),
      value: formatNumber(currentNovel.wordCount),
      icon: FileText
    },
    { label: translate("Volumes"), value: String(data.volumes.length), icon: Boxes },
    { label: translate("Chapters"), value: String(data.chapters.length), icon: BookOpen },
    { label: translate("Scenes"), value: String(data.scenes.length), icon: ListTree },
    { label: translate("Characters"), value: String(data.characters.length), icon: UsersRound },
    { label: translate("Places"), value: String(data.locations.length), icon: MapIcon },
    {
      label: translate("Relationships"),
      value: String(data.relationships.length),
      icon: Network
    },
    { label: translate("Last edited"), value: currentNovel.updatedAt, icon: Clock }
  ];

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={translate("Selected novel")}
        title={currentNovel.title}
        description={currentNovel.synopsis}
        action={
          <>
            <Button onClick={() => onSelectPage("editor")}>
              <PenLine className="size-4" />
              {translate("Open editor")}
            </Button>
            <Button variant="outline" onClick={() => onSelectPage("reader")}>
              <BookOpen className="size-4" />
              {translate("Open reader")}
            </Button>
            <Button
              variant="outline"
              onClick={onPublishToNotion}
              disabled={!notionRootConfigured || notionPublishState === "publishing"}
            >
              <Upload className="size-4" />
              {notionPublishState === "publishing"
                ? translate("Syncing Notion...")
                : translate("Sync with Notion")}
            </Button>
            <Button
              variant="outline"
              onClick={onPullFromNotion}
              disabled={!notionRootConfigured || notionPublishState === "publishing"}
            >
              <Download className="size-4" />
              {notionPublishState === "publishing"
                ? translate("Updating from Notion...")
                : translate("Update from Notion")}
            </Button>
          </>
        }
      />

      {!notionRootConfigured ? (
        <p className="rounded-lg border border-border/60 bg-surface/74 px-4 py-3 text-sm text-muted-foreground">
          {translate("Configure and validate a Notion root page before publishing.")}
        </p>
      ) : null}

      {notionPublishMessage ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notionPublishState === "success"
              ? "border-success/35 bg-success/10 text-success"
              : "border-destructive/35 bg-destructive/10 text-destructive"
          }`}
          role="status"
        >
          <p>{translate(notionPublishMessage)}</p>
          {notionPublishUrl ? (
            <a
              className="mt-1 inline-block underline underline-offset-4"
              href={notionPublishUrl}
              target="_blank"
              rel="noreferrer"
            >
              {translate("Open published novel in Notion")}
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="rounded-lg border border-border/60 bg-surface/74 px-4 py-3 text-sm text-muted-foreground" role="status">
        <span className="font-medium text-foreground">{translate("Notion status")}:</span>{" "}
        {translate(statusLabel)}
        {notionSyncState?.lastNotionSync ? ` · ${translate("Last synced")}: ${new Date(notionSyncState.lastNotionSync).toLocaleString()}` : ""}
      </p>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="grid gap-4">
          <div className="surface-panel rounded-lg p-4">
            <CoverBlock title={currentNovel.title} />
          </div>
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{translate("Novel details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FieldLine
                label={translate("Status")}
                value={<StatusBadge status={currentNovel.status} translate={translate} />}
              />
              <FieldLine label={translate("Genre")} value={translate(currentNovel.genre)} />
              <FieldLine label={translate("Tags")} value={<TagList tags={currentNovel.tags} />} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card className="surface-panel overflow-hidden">
            <CardContent className="grid gap-px bg-border/45 p-0 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-card/96">
                  <MetricCard {...stat} variant="segment" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{translate("Progress")}</CardTitle>
              <CardDescription>{translate("Draft readiness across the first volume")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              {[
                ["Drafted chapters", 68],
                ["Revision pass", 32],
                ["Character bible", 74]
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-lg border border-border/60 bg-surface/78 p-4 shadow-paper-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-medium">{translate(label as string)}</p>
                    <span className="text-sm text-muted-foreground">{value}%</span>
                  </div>
                  <ProgressBar value={Number(value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{translate("Quick actions")}</CardTitle>
              <CardDescription>{translate("Open the next part of the studio")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Open editor", PenLine, "editor"],
                ["Open reader", BookOpen, "reader"],
                ["Add chapter", Plus, "structure"],
                ["Add character", UserRound, "characters"],
                ["Export", Download, "export"]
              ].map(([label, Icon, page]) => {
                const ActionIcon = Icon as typeof Home;
                return (
                  <Button
                    key={label as string}
                    variant="outline"
                    className="justify-start"
                    onClick={() => onSelectPage(page as PageId)}
                  >
                    <ActionIcon className="size-4" />
                    {translate(label as string)}
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
