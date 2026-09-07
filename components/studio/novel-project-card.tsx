import Link from "next/link";
import { Archive, BookOpen, Download, Ellipsis, LoaderCircle, PenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/studio/shared";
import { formatNumber } from "@/lib/studio-data";
import type { Novel, PageId } from "@/lib/studio-domain";
import type { LibraryView } from "@/lib/studio-library-navigation";
import { routeForPage } from "@/lib/studio-routes";

export function NovelProjectCard({ novel, metrics, writingSceneId, view = "grid", isCurrent = false, notionStatus, lastSuccessfulNotionSync, onSelectNovel, onExportNovel, onArchiveNovel, onRestoreNovel, navigationPending = false, navigationLabel = "", translate }: {
  novel: Novel;
  metrics?: { volumeCount: number; chapterCount: number };
  writingSceneId?: string;
  view?: LibraryView;
  isCurrent?: boolean;
  notionStatus?: string | null;
  lastSuccessfulNotionSync?: string | null;
  onSelectNovel?: (novelId: string, nextPage?: PageId, sceneId?: string) => void | Promise<void>;
  onExportNovel?: (novelId: string) => void | Promise<void>;
  onArchiveNovel?: (novel: Novel) => void;
  onRestoreNovel?: (novel: Novel) => void;
  navigationPending?: boolean;
  navigationLabel?: string;
  translate: (text: string) => string;
}) {
  const list = view === "list";
  const counts = `${formatNumber(metrics?.chapterCount ?? 0)} ${translate("Chapters")} · ${formatNumber(novel.wordCount)} ${translate("Words")}`;
  const metadata = list ? counts : `${formatNumber(metrics?.volumeCount ?? 0)} ${translate("Volumes")} · ${counts}`;
  const archived = novel.status === "Archived";
  const openingEditor = navigationPending && navigationLabel === "Opening editor…";
  const closeMenu = (target: EventTarget | null) => {
    const menu = target instanceof Element ? target.closest("details") : null;
    menu?.removeAttribute("open");
  };
  return (
    <Card className="surface-panel relative isolate min-w-0 h-full has-[details[open]]:z-30">
      <CardContent className={list ? "grid min-w-0 items-center gap-x-5 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto]" : "flex h-full min-w-0 flex-col gap-3 p-5 !pt-5"}>
        <div className="min-w-0">
          <div className={list ? "mb-1 flex min-w-0 items-center gap-3" : "mb-3 flex min-w-0 items-center justify-between gap-3"}>
            {!list ? <BookOpen aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" /> : null}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <StatusBadge status={novel.status} translate={translate} />
              {isCurrent ? <Badge variant="accent" aria-label={translate("Current novel")}>{translate("Current")}</Badge> : null}
              {notionStatus ? (
                <Badge
                  variant={notionStatus === "Sync error" ? "outline" : "muted"}
                  className="motion-reduce:transition-none"
                  role="status"
                  aria-label={`${translate("Notion status")}: ${translate(notionStatus)}`}
                  title={lastSuccessfulNotionSync ? `${translate("Last successful sync")}: ${lastSuccessfulNotionSync.replace("T", " ").slice(0, 16)} UTC` : undefined}
                >
                  {translate(notionStatus)}
                </Badge>
              ) : null}
            </div>
          </div>
          <h2 className={list ? "min-w-0 text-base font-semibold leading-6" : "min-h-14 min-w-0 text-[1.15rem] font-semibold leading-7"}>
            <Link href={routeForPage("overview", novel.id)} prefetch={false} title={novel.title}
              onClick={(event) => {
                if (navigationPending) { event.preventDefault(); return; }
                if (!onSelectNovel) return;
                event.preventDefault();
                void onSelectNovel(novel.id, "overview");
              }}
              className="line-clamp-2 break-words [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:after:bg-primary/5 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background">
              {novel.title}
            </Link>
          </h2>
        </div>
        <div className="min-w-0 text-sm text-muted-foreground">
          <p className="truncate" title={metadata}>{metadata}</p>
          <p className="truncate">{translate("Last edited")} <time dateTime={novel.updatedAt}>{novel.updatedAt}</time></p>
        </div>
        <div className={list ? "flex items-center justify-between gap-2" : "mt-auto flex items-center justify-between gap-2 pt-1"}>
          {writingSceneId ? (
            <Button asChild className="relative z-10 h-auto max-w-full whitespace-normal text-left" aria-busy={openingEditor}>
              <Link
                href={routeForPage("editor", novel.id, writingSceneId)}
                prefetch={false}
                aria-label={`${translate("Continue writing")}: ${novel.title}`}
                onClick={(event) => {
                  if (navigationPending) { event.preventDefault(); return; }
                  if (!onSelectNovel) return;
                  event.preventDefault();
                  void onSelectNovel(novel.id, "editor", writingSceneId);
                }}
              >
                {openingEditor ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <PenLine aria-hidden="true" className="size-4" />}{openingEditor ? "Opening editor…" : translate("Continue writing")}
              </Link>
            </Button>
          ) : <span className="text-sm text-primary" aria-hidden="true">{translate("Open project")}</span>}
          <details
            className="relative z-20 shrink-0"
            onKeyDown={(event) => {
              const menu = event.currentTarget;
              if (event.key === "Escape") {
                menu.removeAttribute("open");
                menu.querySelector("summary")?.focus();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
              if (!items.length) return;
              event.preventDefault();
              const currentIndex = items.indexOf(document.activeElement as HTMLElement);
              const nextIndex = event.key === "Home" ? 0
                : event.key === "End" ? items.length - 1
                  : event.key === "ArrowUp" ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
                    : currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
              items[nextIndex]?.focus();
            }}
          >
            <summary aria-label={`${translate("Novel actions")}: ${novel.title}`} aria-haspopup="menu" className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Ellipsis aria-hidden="true" className="size-4" />
            </summary>
            <div role="menu" aria-label={`${translate("Novel actions")}: ${novel.title}`} className="absolute right-0 top-full z-30 mt-1 grid w-48 max-w-[calc(100vw-2rem)] gap-1 rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-lift">
              {!archived ? (["structure", "reader"] as const).map(page => <Link
                key={page}
                prefetch={false}
                href={routeForPage(page, novel.id)}
                role="menuitem"
                onClick={(event) => {
                  if (!onSelectNovel) return;
                  event.preventDefault();
                  closeMenu(event.currentTarget);
                  void onSelectNovel(novel.id, page);
                }}
                className="flex min-h-10 items-center rounded-sm px-3 py-2 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >{translate(page === "structure" ? "Structure" : "Reader")}</Link>) : null}
              {onExportNovel ? <button
                type="button"
                role="menuitem"
                className="flex min-h-10 items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(event) => {
                  closeMenu(event.currentTarget);
                  void onExportNovel?.(novel.id);
                }}
              >
                <Download aria-hidden="true" className="size-4" />
                {translate("Export")}
              </button> : null}
              {archived ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-10 items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    closeMenu(event.currentTarget);
                    onRestoreNovel?.(novel);
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  {translate("Restore novel")}
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-10 items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    closeMenu(event.currentTarget);
                    onArchiveNovel?.(novel);
                  }}
                >
                  <Archive aria-hidden="true" className="size-4" />
                  {translate("Archive")}
                </button>
              )}
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  );
}
