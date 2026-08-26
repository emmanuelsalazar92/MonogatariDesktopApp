"use client";

import { FieldLine, SectionHeader } from "@/components/studio/shared";
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
