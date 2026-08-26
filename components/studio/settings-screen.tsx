"use client";

import * as React from "react";
import { SectionHeader } from "@/components/studio/shared";
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
import { exportFormats, exportOptions, type SidebarState } from "@/lib/studio-domain";
import {
  backupRetentionPolicies,
  notionAutosyncIntervals,
  parseExportDefaults,
  serializeExportDefaults
} from "@/lib/studio-settings";

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
  onSettingChange,
  onNotionConnectionVerified,
  notionAutosyncStatus,
  notionAutosyncRetryAt
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
  onNotionConnectionVerified: (pageId: string, pageTitle: string) => void;
  notionAutosyncStatus: "idle" | "syncing" | "synced" | "error" | "remote-changes";
  notionAutosyncRetryAt: number;
}) {
  const copy = uiCopy[language];
  const [notionRootPage, setNotionRootPage] = React.useState(settings.notionRootPageId);
  const [notionConfigured, setNotionConfigured] = React.useState<boolean | null>(null);
  const [notionConnectionState, setNotionConnectionState] =
    React.useState<NotionConnectionState>("idle");
  const [notionMessage, setNotionMessage] = React.useState("");
  const [notionPageTitle, setNotionPageTitle] = React.useState(settings.notionRootPageTitle);
  const configuredExportDefaults = React.useMemo(
    () => parseExportDefaults(settings.exportDefaults),
    [settings.exportDefaults]
  );
  const autosyncStatusMessage =
    !settings.notionAutosyncEnabled
      ? translate("Automatic sync is off")
      : !settings.notionRootPageId
        ? translate("Connect a Notion root page to enable automatic sync.")
        : notionAutosyncStatus === "syncing"
          ? translate("Automatic Notion sync is running in the background.")
          : notionAutosyncStatus === "remote-changes"
            ? translate("Automatic sync paused because remote changes need review.")
            : notionAutosyncStatus === "error"
              ? `${translate("Automatic sync will retry")}${
                  Number.isFinite(notionAutosyncRetryAt)
                    ? ` ${new Date(notionAutosyncRetryAt).toLocaleTimeString()}`
                    : ""
                }.`
              : notionAutosyncStatus === "synced"
                ? translate("Automatic sync completed.")
                : translate("Automatic sync is waiting for local changes.");

  React.useEffect(() => {
    setNotionRootPage(settings.notionRootPageId);
    setNotionPageTitle(settings.notionRootPageTitle);
  }, [settings.notionRootPageId, settings.notionRootPageTitle]);

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
        pageTitle?: string;
        message?: string;
      };

      if (!response.ok || !result.ok || !result.pageId || !result.pageTitle) {
        throw new Error(result.message ?? "Could not connect to Notion.");
      }

      setNotionRootPage(result.pageId);
      setNotionPageTitle(result.pageTitle);
      onNotionConnectionVerified(result.pageId, result.pageTitle);
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

  const updateExportDefaults = (next: {
    format?: string;
    options?: string[];
  }) => {
    onSettingChange(
      "exportDefaults",
      serializeExportDefaults({
        format: next.format ?? configuredExportDefaults.format,
        options: next.options ?? configuredExportDefaults.options
      })
    );
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
              label={translate("Daily writing goal")}
              value={settings.dailyWordGoal}
              values={["500", "1000", "1500", "2000", "3000"]}
              onChange={(value) => onSettingChange("dailyWordGoal", value)}
              translate={(value) => `${value} ${translate("words")}`}
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
              values={[...backupRetentionPolicies]}
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
                    setNotionPageTitle("");
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

              {notionPageTitle ? (
                <div
                  className="rounded-lg border border-success/35 bg-success/10 px-3 py-2 text-sm text-success"
                  role="status"
                >
                  {translate("Connected root page")}: <strong>{notionPageTitle}</strong>
                </div>
              ) : null}

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
                      ? translate("Private server integration ready")
                      : translate("Private server integration unavailable")}
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

              <div className="rounded-lg border border-border/60 bg-surface/74 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>{translate("Automatic Notion sync")}</Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {translate("Periodically checks pending local changes without interrupting your writing.")}
                    </p>
                  </div>
                  <Switch
                    checked={settings.notionAutosyncEnabled}
                    onCheckedChange={(value) => onSettingChange("notionAutosyncEnabled", value)}
                    disabled={!settings.notionRootPageId}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">
                  {autosyncStatusMessage}
                </p>
                <div className="mt-4">
                  <SettingsSelect
                    label={translate("Notion sync interval")}
                    value={settings.notionAutosyncIntervalMinutes}
                    values={[...notionAutosyncIntervals]}
                    onChange={(value) => onSettingChange("notionAutosyncIntervalMinutes", value)}
                    translate={(value) => `${value} ${translate("minutes")}`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>{translate("Export defaults")}</CardTitle>
              <CardDescription>
                {translate("Used to initialize Export Center. You can change each export without changing these defaults.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingsSelect
                label={translate("Export format")}
                value={configuredExportDefaults.format}
                values={exportFormats}
                onChange={(format) => updateExportDefaults({ format })}
              />
              <div className="grid gap-3">
                {exportOptions.map((option) => (
                  <div
                    key={option}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/74 px-4 py-3"
                  >
                    <span className="text-sm">{translate(option)}</span>
                    <Switch
                      checked={configuredExportDefaults.options.includes(option)}
                      onCheckedChange={(enabled) =>
                        updateExportDefaults({
                          options: enabled
                            ? [...configuredExportDefaults.options, option]
                            : configuredExportDefaults.options.filter((item) => item !== option)
                        })
                      }
                    />
                  </div>
                ))}
              </div>
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
