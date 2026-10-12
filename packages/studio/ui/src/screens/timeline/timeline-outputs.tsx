import type { LucideIcon } from "lucide-react";
import { Download, FlaskConical, Share } from "lucide-react";

import { exportShownRequests } from "@/features/sessions/export-requests";
import { shareSessionFile } from "@/features/sessions/session-file-dialog-store";
import { saveAsTest } from "@/features/tests/recorded-test-store";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/store/types";
import { TOOL } from "./toolbar-tool";

const OUTPUT = cn(
  TOOL,
  "border-line text-fg-muted hover:text-fg disabled:cursor-default disabled:opacity-50 max-sm:hidden",
);

/** Something the requests the Timeline shows become. */
export interface TimelineOutput {
  key: "export" | "share" | "test";
  /** What its button says. */
  label: string;
  /** What a menu says, where nothing else explains it. */
  menuLabel: string;
  /** What its button's tooltip says. */
  title: string;
  icon: LucideIcon;
  run: () => void;
}

/**
 * What the requests the Timeline shows become: an export in the format
 * Settings names, a session file a colleague opens, a test that checks
 * each call against the API definition. The bar shows them as buttons, a
 * phone's "⋯" menu as its items.
 *
 * @param format - The export's format
 * @returns The outputs, in the bar's order
 * @example
 * ```ts
 * outputsOf("har")[0].menuLabel; // "Export as HAR"
 * ```
 */
export function outputsOf(format: ExportFormat): readonly TimelineOutput[] {
  const name = format.toUpperCase();
  return [
    {
      key: "export",
      label: "Export",
      menuLabel: `Export as ${name}`,
      title: `Export the requests as ${name}`,
      icon: Download,
      run: () => void exportShownRequests(format),
    },
    {
      key: "share",
      label: "Share",
      menuLabel: "Share as a session file",
      title: "Share the requests as a session file a colleague opens in their Studio",
      icon: Share,
      run: () => shareSessionFile({ kind: "shown" }),
    },
    {
      key: "test",
      label: "Save as test",
      menuLabel: "Save as test",
      title: "Save the requests as a test that checks each call against the API definition",
      icon: FlaskConical,
      run: () => saveAsTest({ kind: "shown" }),
    },
  ];
}

/**
 * The outputs' buttons, each off while there are no requests. A phone's
 * bar has no room for them: its "⋯" menu holds them instead.
 *
 * @param props - How many requests there are, and the export's format
 * @returns The buttons
 * @example
 * ```tsx
 * <TimelineOutputs total={40} format="har" />
 * ```
 */
export function TimelineOutputs({
  total,
  format,
}: {
  total: number;
  format: ExportFormat;
}): React.ReactNode {
  return (
    <>
      {outputsOf(format).map(({ key, label, title, icon: Icon, run }) => (
        <button
          key={key}
          type="button"
          title={title}
          disabled={total === 0}
          onClick={run}
          className={OUTPUT}
        >
          <Icon aria-hidden="true" className="size-3.25" />
          <span className="max-[1100px]:hidden">{label}</span>
        </button>
      ))}
    </>
  );
}
