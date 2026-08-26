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

export function NovelOverviewScreen({
  data,
  translate,
  onSelectPage
}: {
  data: StudioData;
  translate: (value: string) => string;
  onSelectPage: (page: PageId) => void;
}) {
  const currentNovel = getCurrentNovel(data);
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
          </>
        }
      />

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
