"use client";

import * as React from "react";
import { FieldLine, SectionHeader } from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type Language,
  uiCopy
} from "@/lib/studio-i18n";
import { type PersistedStudioSettings } from "@/lib/studio-data";
import { type SidebarState } from "@/lib/studio-domain";

type ThemeMode = "light" | "dark" | "system";
type NotionConnectionState = "idle" | "testing" | "success" | "error";

export function SettingsScreen({
  theme,
  language,
  sidebarState,
  settings,
  translate,
  onThemeChange,
  onLanguageChange,
  onSidebarStateChange,
  onSettingChange
}: {
  theme: ThemeMode;
  language: Language;
  sidebarState: SidebarState;
  settings: PersistedStudioSettings;
  translate: (value: string) => string;
  onThemeChange: (value: ThemeMode) => void;
  onLanguageChange: (value: Language) => void;
  onSidebarStateChange: (value: SidebarState) => void;
  onSettingChange: (key: keyof PersistedStudioSettings, value: string | boolean) => void;
}) {
  const copy = uiCopy[language];
  const [notionRootPage, setNotionRootPage] = React.useState(settings.notionRootPageId);
  const [notionConfigured, setNotionConfigured] = React.useState<boolean | null>(null);
  const [notionConnectionState, setNotionConnectionState] =
    React.useState<NotionConnectionState>("idle");
  const [notionMessage, setNotionMessage] = React.useState("");

  React.useEffect(() => {
    setNotionRootPage(settings.notionRootPageId);
  }, [settings.notionRootPageId]);

  React.useEffect(() => {
    let active = true;

    void fetch("/api/integrations/notion", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read Notion configuration");
        return (await response.json()) as { configured?: boolean };
      })
      .then((result) => {
        if (active) setNotionConfigured(Boolean(result.configured));
      })
      .catch(() => {
        if (active) setNotionConfigured(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const testNotionConnection = async () => {
    setNotionConnectionState("testing");
    setNotionMessage("");

    try {
      const response = await fetch("/api/integrations/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPage: notionRootPage })
      });
      const result = (await response.json()) as {
        ok?: boolean;
        pageId?: string;
        message?: string;
      };

      if (!response.ok || !result.ok || !result.pageId) {
        throw new Error(result.message ?? "Could not connect to Notion.");
      }

      setNotionRootPage(result.pageId);
      onSettingChange("notionRootPageId", result.pageId);
      setNotionConfigured(true);
      setNotionConnectionState("success");
      setNotionMessage(result.message ?? "Connection successful.");
    } catch (error) {
      setNotionConnectionState("error");
      setNotionMessage(
        error instanceof Error ? error.message : "Could not connect to Notion."
      );
    }
  };

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow={copy.settingsEyebrow}
        title={copy.settingsTitle}
        description={copy.settingsDescription}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>{copy.interface}</CardTitle>
            <CardDescription>{copy.interfaceDefaults}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{copy.uiLanguage}</Label>
              <Select value={language} onValueChange={(value) => onLanguageChange(value as Language)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{copy.english}</SelectItem>
                  <SelectItem value="es">{copy.spanish}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {copy.languageHelp}
              </p>
            </div>
            <SettingsSelect
              label={copy.theme}
              value={theme}
              values={[
                { value: "light", label: copy.light },
                { value: "dark", label: copy.dark },
                { value: "system", label: copy.system }
              ]}
              onChange={(value) => onThemeChange(value as ThemeMode)}
            />
            <SettingsSelect
              label={copy.sidebarDefaultState}
              value={sidebarState}
              values={[
                { value: "expanded", label: copy.expanded },
                { value: "compact", label: copy.compact },
                { value: "hidden", label: copy.hidden }
              ]}
              onChange={(value) => onSidebarStateChange(value as SidebarState)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Editor font size")}
              value={settings.editorFontSize}
              values={["16 px", "18 px", "20 px", "22 px"]}
              onChange={(value) => onSettingChange("editorFontSize", value)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Reader font size")}
              value={settings.readerFontSize}
              values={["16 px", "18 px", "20 px", "22 px"]}
              onChange={(value) => onSettingChange("readerFontSize", value)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Autosave interval")}
              value={settings.autosaveInterval}
              values={["10 seconds", "30 seconds", "60 seconds", "Manual only"]}
              onChange={(value) => onSettingChange("autosaveInterval", value)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Default focus mode")}
              value={settings.defaultFocusMode}
              values={["Writing", "Reading", "Off"]}
              onChange={(value) => onSettingChange("defaultFocusMode", value)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Default reading mode")}
              value={settings.defaultReadingMode}
              values={["Light", "Dark", "Sepia"]}
              onChange={(value) => onSettingChange("defaultReadingMode", value)}
              translate={translate}
            />
            <SettingsSelect
              label={translate("Backup retention")}
              value={settings.backupRetention}
              values={["7 daily backups", "30 daily backups", "90 daily backups"]}
              onChange={(value) => onSettingChange("backupRetention", value)}
              translate={translate}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{translate("Private Notion connection")}</CardTitle>
              <CardDescription>
                {translate("Authorize one root page without exposing your token to the browser.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notion-root-page">{translate("Authorized root page")}</Label>
                <Input
                  id="notion-root-page"
                  className="mt-2"
                  placeholder={translate("Notion page URL or ID")}
                  value={notionRootPage}
                  onChange={(event) => {
                    setNotionRootPage(event.target.value);
                    setNotionConnectionState("idle");
                    setNotionMessage("");
                  }}
                />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {translate(
                    "Only the page ID is stored locally. NOTION_API_TOKEN is read exclusively by the server."
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void testNotionConnection()}
                  disabled={notionConnectionState === "testing" || !notionRootPage.trim()}
                >
                  {notionConnectionState === "testing"
                    ? translate("Testing connection...")
                    : translate("Test Notion connection")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {notionConfigured === null
                    ? translate("Checking server configuration...")
                    : notionConfigured
                      ? translate("Server token configured")
                      : translate("Server token not configured")}
                </span>
              </div>

              {notionMessage ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    notionConnectionState === "success"
                      ? "border-success/35 bg-success/10 text-success"
                      : "border-destructive/35 bg-destructive/10 text-destructive"
                  }`}
                  role="status"
                >
                  {translate(notionMessage)}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{copy.localServer}</CardTitle>
              <CardDescription>{copy.localServerDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>{copy.localServerDisplayName}</Label>
                <Input
                  className="mt-2"
                  value={settings.localServerDisplayName}
                  onChange={(event) =>
                    onSettingChange("localServerDisplayName", event.target.value)
                  }
                />
              </div>
              <FieldLine label={copy.exportDefaults} value={settings.exportDefaults} />
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/74 px-4 py-3">
                <span className="text-sm">{copy.typewriterFont}</span>
                <Switch
                  checked={settings.typewriterFont}
                  onCheckedChange={(value) => onSettingChange("typewriterFont", value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{copy.localFirstNotice}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/55 bg-surface-elevated/95 p-4 text-sm leading-7 text-editor-foreground shadow-paper-sm">
                {copy.localFirstCopy}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingsSelect({
  label,
  value,
  values,
  translate,
  onChange
}: {
  label: string;
  value: string;
  values: Array<string | { value: string; label: string }>;
  translate?: (value: string) => string;
  onChange?: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem
              key={typeof item === "string" ? item : item.value}
              value={typeof item === "string" ? item : item.value}
            >
              {translate
                ? translate(typeof item === "string" ? item : item.label)
                : typeof item === "string"
                  ? item
                  : item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
