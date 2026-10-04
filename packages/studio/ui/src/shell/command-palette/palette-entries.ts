import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CircleAlert,
  Pause,
  Play,
  RadioTower,
  Rocket,
  SunMoon,
  Trash2,
} from "lucide-react";

import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store";
import { SHELL_NAV } from "../nav";

/** What an entry does when it is chosen. */
export type PaletteAction =
  | { kind: "go"; to: NonNullable<LinkProps["to"]> }
  | { kind: "open-request"; id: string }
  | { kind: "show-errors" }
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

/**
 * Everything the palette offers: the latest calls, every view, and the
 * actions that work from anywhere.
 *
 * @param requests - The captured requests, newest first
 * @param paused - Whether recording is paused
 * @returns The entries, grouped in order
 * @example
 * ```ts
 * paletteEntries(useStudioStore.getState().requests, false);
 * ```
 */
export function paletteEntries(requests: readonly RequestEntry[], paused: boolean): PaletteEntry[] {
  const actions: PaletteEntry[] = [
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
      id: "action:theme",
      group: "Actions",
      label: "Toggle theme",
      meta: "Dark · Light · Auto",
      icon: SunMoon,
      hint: "⇧ ⌘ L",
      action: { kind: "toggle-theme" },
    },
    {
      id: "action:clear",
      group: "Actions",
      label: "Clear captured requests",
      meta: "",
      icon: Trash2,
      action: { kind: "clear-requests" },
    },
  ];
  return [...recentEntries(requests), ...goToEntries(), ...actions];
}
