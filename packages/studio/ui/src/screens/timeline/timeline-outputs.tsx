import { Download, FlaskConical, Share } from "lucide-react";

import { exportShownRequests } from "@/features/sessions/export-requests";
import { shareSessionFile } from "@/features/sessions/session-file-dialog-store";
import { saveAsTest } from "@/features/tests/recorded-test-store";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/store/types";
import { TOOL } from "./toolbar-tool";

const OUTPUT = cn(
  TOOL,
  "border-line text-fg-muted hover:text-fg disabled:cursor-default disabled:opacity-50",
);

/**
 * What the requests the Timeline shows become: an export in the format
 * Settings names, a session file a colleague opens, a test that checks
 * each call against the API definition — each off while there are none.
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
      <button
        type="button"
        title={`Export the requests as ${format.toUpperCase()}`}
        disabled={total === 0}
        onClick={() => void exportShownRequests(format)}
        className={OUTPUT}
      >
        <Download aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Export</span>
      </button>
      <button
        type="button"
        title="Share the requests as a session file a colleague opens in their Studio"
        disabled={total === 0}
        onClick={() => shareSessionFile({ kind: "shown" })}
        className={OUTPUT}
      >
        <Share aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Share</span>
      </button>
      <button
        type="button"
        title="Save the requests as a test that checks each call against the API definition"
        disabled={total === 0}
        onClick={() => saveAsTest({ kind: "shown" })}
        className={OUTPUT}
      >
        <FlaskConical aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Save as test</span>
      </button>
    </>
  );
}
