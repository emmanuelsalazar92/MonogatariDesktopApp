"use client";

import {
  BookOpen,
  ChevronsRight,
  Columns3,
  Languages,
  Menu,
  PanelLeftOpen,
  ShieldCheck
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToolbarIconButton } from "@/components/studio/shared";
import { type Novel, type SidebarState } from "@/lib/studio-domain";

type ThemeMode = "light" | "dark" | "system";
type Language = "en" | "es";

type TopBarCopy = {
  openNavigation: string;
  toggleSidebar: string;
  localStatus: string;
  language: string;
  english: string;
  spanish: string;
  light: string;
  dark: string;
  system: string;
};

export function TopBar({
  pageLabel,
  subtitle,
  sidebarState,
  theme,
  language,
  novels,
  activeNovelId,
  dataStatusLabel,
  copy,
  onOpenMobileNav,
  onCycleSidebar,
  onActiveNovelChange,
  onThemeChange,
  onLanguageChange
}: {
  pageLabel: string;
  subtitle: string;
  sidebarState: SidebarState;
  theme: ThemeMode;
  language: Language;
  novels: Novel[];
  activeNovelId: string;
  dataStatusLabel: string;
  copy: TopBarCopy;
  onOpenMobileNav: () => void;
  onCycleSidebar: () => void;
  onActiveNovelChange: (novelId: string) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLanguageChange: (language: Language) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/82 backdrop-blur-xl">
      <div className="flex min-h-[4.5rem] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <ToolbarIconButton label={copy.openNavigation} onClick={onOpenMobileNav}>
          <Menu className="size-5 md:hidden" />
          <PanelLeftOpen className="hidden size-5 md:block" />
        </ToolbarIconButton>
        <ToolbarIconButton
          label={copy.toggleSidebar}
          onClick={onCycleSidebar}
          active={sidebarState !== "hidden"}
        >
          {sidebarState === "hidden" ? (
            <ChevronsRight className="size-5" />
          ) : (
            <Columns3 className="size-5" />
          )}
        </ToolbarIconButton>

        <Separator orientation="vertical" className="hidden h-7 sm:block" />

        <div className="order-last min-w-0 basis-full border-t border-border/45 pt-3 sm:order-none sm:basis-auto sm:border-t-0 sm:pt-0">
          <p className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[13px]">
            {pageLabel}
          </p>
          <p className="hidden truncate text-[15px] text-foreground/88 sm:block">{subtitle}</p>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/78 px-3 py-2 text-xs text-muted-foreground lg:flex">
          <ShieldCheck className="size-4 text-primary" />
          <span>
            {copy.localStatus} - {dataStatusLabel}
          </span>
        </div>

        {novels.length ? (
          <Select value={activeNovelId} onValueChange={onActiveNovelChange}>
            <SelectTrigger className="hidden h-10 min-w-[240px] max-w-[320px] lg:flex">
              <BookOpen className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {novels.map((novel) => (
                <SelectItem key={novel.id} value={novel.id}>
                  {novel.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={language} onValueChange={(value) => onLanguageChange(value as Language)}>
          <SelectTrigger className="h-10 w-[98px] sm:w-[110px]" aria-label={copy.language}>
            <Languages className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{copy.english}</SelectItem>
            <SelectItem value="es">{copy.spanish}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={theme} onValueChange={(value) => onThemeChange(value as ThemeMode)}>
          <SelectTrigger className="h-10 w-[104px] sm:w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">{copy.light}</SelectItem>
            <SelectItem value="dark">{copy.dark}</SelectItem>
            <SelectItem value="system">{copy.system}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
