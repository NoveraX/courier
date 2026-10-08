import {
  CircleAlert,
  Download,
  FileInput,
  Pause,
  Play,
  RadioTower,
  Share,
  SunMoon,
  Trash2,
} from "lucide-react";

import type { ExportFormat } from "@/store/types";
import type { PaletteEntry } from "./palette-entries";

/**
 * The palette's actions that work from anywhere: recording, the Timeline's
 * views, the theme, export, a session file shared or opened, and clearing
 * the requests — each with the shortcut that runs it outside the palette.
 *
 * @param paused - Whether recording is paused
 * @param exportFormat - The format an export downloads in
 * @returns The entries, in order
 * @example
 * ```ts
 * actionEntries(false, "har");
 * ```
 */
export function actionEntries(paused: boolean, exportFormat: ExportFormat): PaletteEntry[] {
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
      id: "action:share",
      group: "Actions",
      label: "Share as a session file",
      meta: "for a bug report",
      icon: Share,
      action: { kind: "share-session-file" },
    },
    {
      id: "action:open-session-file",
      group: "Actions",
      label: "Open a session file",
      meta: "one a colleague shared",
      icon: FileInput,
      action: { kind: "open-session-file" },
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
