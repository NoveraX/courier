import {
  Palette,
  Cable,
  Circle,
  Eye,
  Bell,
  Code2,
  FileOutput,
  History,
  AlertTriangle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

// ── Section navigation config ────────────────────────────────────────────────

export interface SectionConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const SECTION_CONFIG: [SectionConfig, ...SectionConfig[]] = [
  { id: "appearance", label: "Appearance", icon: Palette, description: "Theme, color scheme, and UI density" },
  { id: "connection", label: "Connection", icon: Cable, description: "Server connection and reconnection behavior" },
  { id: "recording", label: "Recording", icon: Circle, description: "Request capture limits, log persistence, and ignore patterns" },
  { id: "display", label: "Display", icon: Eye, description: "Timestamp format, JSON indentation, and preview" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Toast alerts for errors and slow requests" },
  { id: "export", label: "Export", icon: FileOutput, description: "Default format for session exports" },
  { id: "apis", label: "APIs Defaults", icon: Code2, description: "Default options for API import and code generation" },
  { id: "sessions", label: "Session History", icon: History, description: "Saved sessions and export options" },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle, description: "Destructive actions — clear data, reset settings" },
];

// ── Grouped nav for sidebar ─────────────────────────────────────────────────

interface SectionNavGroup {
  label: string;
  items: SectionConfig[];
}

export const SECTION_NAV_GROUPS: SectionNavGroup[] = [
  {
    label: "General",
    items: SECTION_CONFIG.filter((s) =>
      ["appearance", "connection"].includes(s.id),
    ),
  },
  {
    label: "Capture",
    items: SECTION_CONFIG.filter((s) =>
      ["recording", "display", "notifications"].includes(s.id),
    ),
  },
  {
    label: "Advanced",
    items: SECTION_CONFIG.filter((s) =>
      ["export", "apis", "sessions"].includes(s.id),
    ),
  },
  {
    label: "System",
    items: SECTION_CONFIG.filter((s) => s.id === "danger"),
  },
];

// ── Select options ───────────────────────────────────────────────────────────

export const TIMESTAMP_OPTIONS = [
  { value: "relative", label: "Relative (2s ago)" },
  { value: "absolute", label: "Absolute (14:23:05)" },
] as const;

export const JSON_INDENT_OPTIONS = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
] as const;

export const SLOW_THRESHOLD_OPTIONS = [
  { value: "200", label: "200 ms" },
  { value: "500", label: "500 ms" },
  { value: "1000", label: "1 s" },
  { value: "2000", label: "2 s" },
  { value: "5000", label: "5 s" },
] as const;

export const MAX_REQUESTS_OPTIONS = [
  { value: "100", label: "100" },
  { value: "500", label: "500" },
  { value: "1000", label: "1,000" },
  { value: "2000", label: "2,000" },
  { value: "5000", label: "5,000" },
  { value: "10000", label: "10,000" },
] as const;

export const RECONNECT_DELAY_OPTIONS = [
  { value: "500", label: "0.5 s" },
  { value: "1000", label: "1 s" },
  { value: "3000", label: "3 s" },
  { value: "5000", label: "5 s" },
  { value: "10000", label: "10 s" },
] as const;

export const VALIDATION_LIB_OPTIONS = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
] as const;

export const GROUP_BY_OPTIONS = [
  { value: "tag", label: "By tag" },
  { value: "path", label: "By path" },
  { value: "single", label: "Single group" },
] as const;

export const CLIENT_OPTIONS = [
  { value: "direct", label: "Direct (universal)" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
] as const;
