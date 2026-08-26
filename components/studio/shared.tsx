"use client";

import * as React from "react";
import { BookMarked, LayoutDashboard } from "lucide-react";

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
  Secondary: "bg-secondary text-secondary-foreground",
  Missing: "bg-muted/85 text-muted-foreground",
  Dead: "bg-foreground/14 text-muted-foreground",
  Spoiler: "bg-destructive text-destructive-foreground"
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
  compact = false
}: {
  title: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/60 bg-editor shadow-paper-sm",
        compact ? "h-28 w-20" : "aspect-[3/4] min-h-48"
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 paper-texture opacity-60" />
      <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-primary/55" />
      <div className="absolute inset-x-3 bottom-3 h-10 rounded-md border border-border/50 bg-background/58" />
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
        <div>
          <BookMarked className="mx-auto mb-3 size-7 text-primary/90" />
          <p className="text-sm font-semibold leading-snug text-foreground/95">{title}</p>
        </div>
      </div>
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
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="bg-background/45">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted/85">
      <div
        className="h-full rounded-full bg-primary shadow-[0_0_0_1px_rgba(101,70,39,0.08)]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-surface/70 p-8 text-center">
      <Icon className="mx-auto mb-4 size-8 text-muted-foreground" />
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>
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
  active = false
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      aria-label={label}
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
