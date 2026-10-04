import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CircleAlert,
  Download,
  Pause,
  Play,
  RadioTower,
  Rocket,
  SunMoon,
  Trash2,
} from "lucide-react";

import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store";
import type { ExportFormat } from "@/store/types";
import { SHELL_NAV } from "../nav";

/** What an entry does when it is chosen. */
export type PaletteAction =
  | { kind: "go"; to: NonNullable<LinkProps["to"]> }
  | { kind: "open-request"; id: string }
  | { kind: "show-errors" }
  | { kind: "show-streams" }
  | { kind: "export" }
  | { kind: "toggle-recording" }
  | { kind: "toggle-theme" }
  | { kind: "clear-requests" };

/** One line of the palette. */
export interface PaletteEntry {
  id: string;
  group: "Recent requests" | "Go to" | "Actions";
  label: string;
  meta: string;
  icon: LucideIcon;
  /** The shortcut that runs it outside the palette. */
  hint?: string;
  /** Set in the mono face: a request's endpoint. */
  mono?: boolean;
  action: PaletteAction;
}

/* The latest calls, newest first, to open in the Timeline. */
function recentEntries(requests: readonly RequestEntry[]): PaletteEntry[] {
  return requests.slice(0, 4).map((r) => {
    const live = r.transport === "sse" || r.transport === "ws";
    const outcome = [
      r.httpMethod ?? "",
      r.statusCode ?? "—",
      r.timing ? formatDuration(r.timing.total) : "",
    ];
    return {
      id: `request:${r.id}`,
      group: "Recent requests",
      label: [r.group, r.method].filter(Boolean).join("."),
      meta: live
        ? (r.transport ?? "").toUpperCase()
        : outcome.filter((part) => part !== "").join(" · "),
      icon: live ? RadioTower : Activity,
      mono: true,
      action: { kind: "open-request", id: r.id },
    };
  });
}

function goToEntries(): PaletteEntry[] {
  const views = SHELL_NAV.flatMap((group) =>
    group.items.map((item) => ({
      id: `view:${item.label}`,
      group: "Go to" as const,
      label: item.label,
      meta: group.label,
      icon: item.icon,
      action: { kind: "go" as const, to: item.to },
    })),
  );
  const setup: PaletteEntry = {
    id: "view:setup",
    group: "Go to",
    label: "Get started",
    meta: "Setup",
    icon: Rocket,
    action: { kind: "go", to: "/next" },
  };
  return [setup, ...views];
}

function actionEntries(paused: boolean, exportFormat: ExportFormat): PaletteEntry[] {
  return [
    {
      id: "action:recording",
      group: "Actions",
      label: paused ? "Resume recording" : "Pause recording",
      meta: "",
      icon: paused ? Play : Pause,
      hint: "⌘ .",
      action: { kind: "toggle-recording" },
    },
    {
      id: "action:errors",
      group: "Actions",
      label: "Show only errors",
      meta: "Timeline",
      icon: CircleAlert,
      action: { kind: "show-errors" },
    },
    {
      id: "action:streams",
      group: "Actions",
      label: "Show streams",
      meta: "SSE · WebSocket",
      icon: RadioTower,
      action: { kind: "show-streams" },
    },
    {
      id: "action:theme",
      group: "Actions",
      label: "Toggle theme",
      meta: "Dark · Light · Auto",
      icon: SunMoon,
      hint: "⇧ ⌘ L",
      action: { kind: "toggle-theme" },
    },
    {
      id: "action:export",
      group: "Actions",
      label: "Export the requests",
      meta: `as ${exportFormat.toUpperCase()}`,
      icon: Download,
      hint: "⌘ E",
      action: { kind: "export" },
    },
    {
      id: "action:clear",
      group: "Actions",
      label: "Clear captured requests",
      meta: "",
      icon: Trash2,
      hint: "⌘ ⌫",
      action: { kind: "clear-requests" },
    },
  ];
}

/**
 * Everything the palette offers: the latest calls, every view, and the
 * actions that work from anywhere.
 *
 * @param requests - The captured requests, newest first
 * @param paused - Whether recording is paused
 * @param exportFormat - The format an export downloads in
 * @returns The entries, grouped in order
 * @example
 * ```ts
 * paletteEntries(useStudioStore.getState().requests, false, "har");
 * ```
 */
export function paletteEntries(
  requests: readonly RequestEntry[],
  paused: boolean,
  exportFormat: ExportFormat,
): PaletteEntry[] {
  return [...recentEntries(requests), ...goToEntries(), ...actionEntries(paused, exportFormat)];
}
