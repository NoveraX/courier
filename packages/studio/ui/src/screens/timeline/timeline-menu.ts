import { History, Trash2 } from "lucide-react";

import type { OverflowAction } from "@/design/overflow-menu";
import type { ExportFormat } from "@/store/types";
import { outputsOf } from "./timeline-outputs";

/** What the Timeline's "⋯" menu works with. */
export interface TimelineMenuInput {
  /** Whether Clear keeps the pinned requests. */
  preserve: boolean;
  onPreserve: () => void;
  onClear: () => void;
  /** How many requests there are: what they become is off while there are none. */
  total: number;
  format: ExportFormat;
}

/**
 * What a phone's Timeline bar keeps in its "⋯" menu, the actions a wider
 * bar shows as buttons: Preserve log, ticked while it is on, Clear, and
 * what the requests become — an export, a session file, a test.
 *
 * @param input - Preserve log and Clear, how many requests there are, and the export's format
 * @returns The menu's actions, in the bar's order
 * @example
 * ```ts
 * timelineMenu({ preserve: true, onPreserve, onClear, total: 40, format: "har" })[0].checked; // true
 * ```
 */
export function timelineMenu({
  preserve,
  onPreserve,
  onClear,
  total,
  format,
}: TimelineMenuInput): OverflowAction[] {
  return [
    {
      key: "preserve",
      label: "Preserve log",
      icon: History,
      checked: preserve,
      onSelect: onPreserve,
    },
    { key: "clear", label: "Clear", icon: Trash2, tone: "danger", onSelect: onClear },
    ...outputsOf(format).map(({ key, menuLabel, icon, run }) => ({
      key,
      label: menuLabel,
      icon,
      disabled: total === 0,
      onSelect: run,
    })),
  ];
}
