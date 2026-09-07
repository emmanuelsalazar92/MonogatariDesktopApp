"use client";

import * as React from "react";
import Image from "next/image";
import { LayoutDashboard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Character, type ChapterStatus, type NovelStatus } from "@/lib/studio-domain";
import { cn } from "@/lib/utils";

const statusClass: Record<NovelStatus | ChapterStatus | Character["status"], string> = {
  Idea: "bg-muted/85 text-muted-foreground",
  Planning: "bg-secondary text-secondary-foreground",
  Writing: "bg-primary text-primary-foreground",
  Revision: "bg-accent/18 text-primary",
  Complete: "bg-success text-success-foreground",
  Archived: "bg-foreground/12 text-muted-foreground",
  Draft: "bg-secondary text-secondary-foreground",
  Ready: "bg-success text-success-foreground",
  Final: "bg-warning/18 text-foreground",
  Active: "bg-primary text-primary-foreground",
  Inactive: "bg-muted/85 text-muted-foreground"
};

export function StatusBadge({
  status,
  translate
}: {
  status: keyof typeof statusClass;
  translate?: (value: string) => string;
}) {
  return (
    <Badge className={cn("border-transparent", statusClass[status])}>
      {translate ? translate(status) : status}
    </Badge>
  );
}

export function CoverBlock({
  title,
  coverImage = "",
  compact = false
}: {
  title: string;
  coverImage?: string;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const safeTitle = typeof title === "string" && title.trim() ? title : "Untitled novel";
  const safeCoverImage = typeof coverImage === "string" ? coverImage : "";
  React.useEffect(() => setImageFailed(false), [safeCoverImage]);
  const accent = [
    "from-primary/80 via-primary/35 to-transparent",
    "from-accent/70 via-primary/30 to-transparent",
    "from-amber-700/60 via-primary/25 to-transparent",
    "from-violet-700/60 via-primary/25 to-transparent"
  ][Array.from(safeTitle).reduce((total, character) => total + character.charCodeAt(0), 0) % 4];
  // Covers are supplied by the app's local upload/storage flow. Do not turn a
  // metadata field into a client-side fetcher for arbitrary remote URLs.
  const coverSource = safeCoverImage.startsWith("/") ? safeCoverImage : "";
  const hasCover = Boolean(coverSource) && !imageFailed;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-editor shadow-paper-sm",
        compact ? "h-20 w-14" : "h-28 w-20"
      )}
    >
      {hasCover ? <Image src={coverSource} alt={`Cover of ${safeTitle}`} fill sizes="56px" className="object-cover" onError={() => setImageFailed(true)} /> : (
        <div aria-hidden="true" className={cn("absolute inset-0 bg-gradient-to-br", accent)}>
          <div className="absolute inset-0 paper-texture opacity-45" />
          <div className="absolute inset-x-2 top-2 h-px bg-background/70" />
          <div className="absolute inset-x-2 bottom-2 text-center text-[9px] font-semibold leading-tight text-foreground/90 [overflow-wrap:anywhere]">
            {safeTitle.slice(0, 28)}
          </div>
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-4xl font-semibold leading-[1.02] tracking-normal text-foreground sm:text-[2.85rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-[15px] leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  detail,
  variant = "card"
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  detail?: string;
  variant?: "card" | "segment";
}) {
  if (variant === "segment") {
    return (
      <div className="flex min-w-0 items-center gap-4 px-5 py-4 sm:px-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-[1.55rem] font-semibold leading-none text-foreground">
            {value}
          </p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-2xl font-semibold leading-tight">{value}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  const safeTags = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : [];
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {safeTags.map((tag) => (
        <Badge key={tag} variant="outline" className="max-w-full break-words bg-background/45 [overflow-wrap:anywhere]">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  label = "Progress"
}: {
  value: number;
  label?: string;
}) {
  const normalizedValue = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-muted/85"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
    >
      <div
        className="h-full rounded-full bg-primary shadow-[0_0_0_1px_rgb(var(--primary)/0.1)]"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-surface/70 p-8 text-center">
      <Icon className="mx-auto mb-4 size-8 text-muted-foreground" />
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function FieldLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 rounded-md border border-border/60 bg-surface/74 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="text-sm leading-relaxed text-foreground">{value}</div>
    </div>
  );
}

export function ToolbarIconButton({
  label,
  children,
  onClick,
  active = false,
  expanded,
  id
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  expanded?: boolean;
  id?: string;
}) {
  return (
    <Button
      type="button"
      id={id}
      variant={active ? "secondary" : "ghost"}
      size="icon"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onClick}
      className={cn("shrink-0 rounded-full", active && "bg-secondary")}
    >
      {children}
    </Button>
  );
}

export function MapIcon(props: React.ComponentProps<typeof LayoutDashboard>) {
  return <LayoutDashboard {...props} />;
}
