import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Activity, RadioTower, Rocket } from "lucide-react";

import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store";
import type { ExportFormat } from "@/store/types";
import { SHELL_NAV } from "../nav";
import { actionEntries } from "./palette-actions";

/** What an entry does when it is chosen. */
export type PaletteAction =
  | { kind: "go"; to: NonNullable<LinkProps["to"]> }
  | { kind: "open-request"; id: string }
  | { kind: "show-errors" }
  | { kind: "show-streams" }
  | { kind: "export" }
  | { kind: "share-session-file" }
  | { kind: "save-as-test" }
  | { kind: "open-session-file" }
  | { kind: "deliver-webhook" }
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
    action: { kind: "go", to: "/" },
  };
  return [setup, ...views];
}

/** Where recording stands, as the palette's first action reads it. */
export type RecordingState = "recording" | "paused" | "session";

/**
 * Everything the palette offers: the latest calls, every view, and the
 * actions that work from anywhere.
 *
 * @param requests - The captured requests, newest first
 * @param recording - Whether Studio records, is paused, or shows a saved session
 * @param exportFormat - The format an export downloads in
 * @returns The entries, grouped in order
 * @example
 * ```ts
 * paletteEntries(useStudioStore.getState().requests, "recording", "har");
 * ```
 */
export function paletteEntries(
  requests: readonly RequestEntry[],
  recording: RecordingState,
  exportFormat: ExportFormat,
): PaletteEntry[] {
  return [...recentEntries(requests), ...goToEntries(), ...actionEntries(recording, exportFormat)];
}
