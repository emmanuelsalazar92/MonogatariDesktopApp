"use client";

import Link from "next/link";

import { Clock3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routeForCharacter, routeForPage, routeForPlace } from "@/lib/studio-routes";
import type { StudioData } from "@/lib/studio-data";
import type { RecentActivity } from "@/lib/studio-domain";

export function RecentActivityList({ data, novelId, translate }: {
  data: StudioData;
  novelId: string;
  translate: (value: string) => string;
}) {
  const activities = data.recentActivities.filter(isRenderableActivity).slice(0, 10);
  return (
    <Card className="surface-panel">
      <CardHeader className="pb-3">
        <CardTitle>{translate("Recent activity")}</CardTitle>
        <CardDescription>{translate("A short local history to help you resume work")}</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length ? <ol className="grid divide-y divide-border/55" aria-label={translate("Recent activity")}>
          {activities.map((activity) => {
            const href = activityHref(activity, data, novelId);
            const exactDate = formatExactDate(activity.createdAt);
            const content = <>
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{activity.label}</span>
              <time dateTime={activity.createdAt} title={exactDate} aria-label={exactDate} className="shrink-0 text-xs text-muted-foreground">{relativeTime(activity.createdAt)}</time>
            </>;
            return <li key={activity.id} className="flex min-w-0 items-start gap-2 py-2.5 text-sm text-foreground">
              <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {href ? <Link href={href} prefetch={false} aria-label={`${activity.label}. ${exactDate}`} className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link> : <div className="flex min-w-0 flex-1 items-start justify-between gap-3">{content}</div>}
            </li>;
          })}
        </ol> : <p className="text-sm text-muted-foreground">{translate("No recent activity yet.")}</p>}
      </CardContent>
    </Card>
  );
}

function isRenderableActivity(activity: RecentActivity) {
  return Boolean(
    activity &&
    typeof activity.id === "string" &&
    typeof activity.novelId === "string" &&
    typeof activity.label === "string" &&
    typeof activity.createdAt === "string" &&
    Number.isFinite(new Date(activity.createdAt).getTime())
  );
}

function formatExactDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function activityHref(activity: RecentActivity, data: StudioData, novelId: string) {
  if (!activity.entityId) return null;
  if (activity.entityType === "volume" || activity.entityType === "chapter") {
    return data.volumes.some((item) => item.id === activity.entityId) || data.chapters.some((item) => item.id === activity.entityId)
      ? routeForPage("structure", novelId)
      : null;
  }
  if (activity.entityType === "scene") {
    const scene = data.scenes.find((item) => item.id === activity.entityId);
    return scene ? (scene.archived ? routeForPage("structure", novelId) : routeForPage("editor", novelId, scene.id)) : null;
  }
  if (activity.entityType === "character") return data.characters.some((item) => item.id === activity.entityId) ? routeForCharacter(novelId, activity.entityId) : null;
  if (activity.entityType === "place") return data.locations.some((item) => item.id === activity.entityId) ? routeForPlace(novelId, activity.entityId) : null;
  return null;
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  const [unit, size] = units.find(([, duration]) => Math.abs(elapsed) >= duration) ?? ["second", 1_000] as [Intl.RelativeTimeFormatUnit, number];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.round(elapsed / size), unit);
}
