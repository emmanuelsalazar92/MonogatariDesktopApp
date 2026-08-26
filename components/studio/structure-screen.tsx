"use client";

import {
  Archive,
  ChevronDown,
  ChevronLeft,
  Copy,
  Edit3,
  Home,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Workflow
} from "lucide-react";

import { SectionHeader, StatusBadge } from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { formatNumber, getCurrentNovel, type StudioData } from "@/lib/studio-data";
import { type ChapterStatus } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

export function StructureScreen({
  data,
  translate,
  onOpenDialog
}: {
  data: StudioData;
  translate: (value: string) => string;
  onOpenDialog: () => void;
}) {
  const currentNovel = getCurrentNovel(data);

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={translate("Structure")}
        title={translate("Story tree")}
        description={translate(
          "Arrange volumes, chapters, and scenes with drag-style handles and status badges."
        )}
        action={
          <>
            <Button onClick={onOpenDialog}>
              <FolderPlus className="size-4" />
              {translate("Add volume")}
            </Button>
            <Button variant="outline" onClick={onOpenDialog}>
              <Plus className="size-4" />
              {translate("Add chapter")}
            </Button>
            <Button variant="outline" onClick={onOpenDialog}>
              <Plus className="size-4" />
              {translate("Add scene")}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>{currentNovel.title}</CardTitle>
            <CardDescription>{translate("Visual outline with draft states")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.volumes.map((volume) => {
              const volumeChapters = data.chapters.filter(
                (chapter) => chapter.volumeId === volume.id
              );
              return (
                <div
                  key={volume.id}
                  className="rounded-xl border border-border/55 bg-surface-elevated/90 p-3 shadow-paper-sm"
                >
                  <StructureRow
                    depth={0}
                    title={volume.title}
                    subtitle={volume.summary}
                    status="Ready"
                    strong
                    translate={translate}
                  />
                  <div className="mt-2 space-y-2">
                    {volumeChapters.length ? (
                      volumeChapters.map((chapter) => {
                        const chapterScenes = data.scenes.filter(
                          (scene) => scene.chapterId === chapter.id
                        );
                        return (
                          <div key={chapter.id}>
                            <StructureRow
                              depth={1}
                              title={chapter.title}
                              subtitle={`${formatNumber(chapter.wordCount)} ${translate("words")}`}
                              status={chapter.status}
                              translate={translate}
                            />
                            <div className="space-y-2">
                              {chapterScenes.map((scene) => (
                                <StructureRow
                                  key={scene.id}
                                  depth={2}
                                  title={scene.title}
                                  subtitle={scene.objective}
                                  status={scene.status}
                                  translate={translate}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="ml-8 rounded-lg border border-dashed border-border/70 bg-surface/74 p-3 text-sm text-muted-foreground">
                        {translate("Empty volume. Add chapter to continue the outline.")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>{translate("Outline actions")}</CardTitle>
            <CardDescription>{translate("Context operations for selected items")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              ["Rename", Edit3],
              ["Duplicate", Copy],
              ["Archive", Archive],
              ["Move before", ChevronUpIcon],
              ["Move after", ChevronDown]
            ].map(([label, Icon]) => {
              const ActionIcon = Icon as typeof Home;
              return (
                <Button key={label as string} variant="outline" className="justify-start">
                  <ActionIcon className="size-4" />
                  {translate(label as string)}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChevronUpIcon(props: React.ComponentProps<typeof Home>) {
  return <ChevronLeft className="-rotate-90" {...props} />;
}

function StructureRow({
  depth,
  title,
  subtitle,
  status,
  strong = false,
  translate
}: {
  depth: number;
  title: string;
  subtitle: string;
  status: ChapterStatus;
  strong?: boolean;
  translate: (value: string) => string;
}) {
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg bg-card/82 p-3 shadow-soft ring-1 ring-border/55"
      style={{ marginLeft: `${depth * 1.5}rem` }}
    >
      <button
        type="button"
        className="grid size-8 place-items-center rounded-md border border-border/60 bg-surface text-muted-foreground"
        aria-label={translate("Drag item")}
        title={translate("Drag item")}
      >
        <Workflow className="size-4" />
      </button>
      <div className="min-w-0">
        <p className={cn("truncate text-[14px]", strong && "font-semibold")}>{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <StatusBadge status={status} translate={translate} />
      <Button
        variant="ghost"
        size="icon"
        aria-label={translate("More structure options")}
        title={translate("More structure options")}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    </div>
  );
}
