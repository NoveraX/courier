import { PanelRight } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { playgroundCells } from "@/features/playground/playground-cells";
import { StatCellGrid } from "@/inspector/stat-cell-grid";
import type { PayloadMode } from "@/inspector/tabs/payload-tab";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { ResponseTab } from "./response-content";
import { ResponseContent } from "./response-content";

interface ResponsePaneProps {
  entry: PlaygroundHistoryEntry | null;
  row: RequestEntry | undefined;
  tab: ResponseTab;
  onTab: (tab: ResponseTab) => void;
  payload: { mode: PayloadMode; onMode: (mode: PayloadMode) => void };
  now: number;
  slowMs: number;
  sendingLabel: string;
  /** Open the request the run made in the inspector. */
  onInspect: (requestId: string) => void;
  onCancel: () => void;
  /** Runs the call as server code, in Direct mode; `undefined` while a call is under way. */
  onRunAsServer?: (() => void) | undefined;
}

function tabsOf(
  entry: PlaygroundHistoryEntry | null,
  row: RequestEntry | undefined,
): SegmentedOption<ResponseTab>[] {
  if (entry?.transport) {
    const count = row
      ? Math.max(row.streamEventCount ?? 0, row.streamEvents?.length ?? 0)
      : undefined;
    return [
      { value: "messages", label: "Messages", count, countTone: "subtle" },
      { value: "headers", label: "Headers" },
    ];
  }
  return [
    { value: "body", label: "Body" },
    { value: "headers", label: "Headers" },
    { value: "timing", label: "Timing" },
  ];
}

/**
 * The response half of the Playground: the way to the inspector, four
 * figures, the tabs, and what the chosen tab shows.
 *
 * @param props - The run, the request it made, the tab, the body's view mode, the time, the slow threshold, the in-flight label, and what inspects, cancels and runs the call as server code
 * @returns The pane
 * @example
 * ```tsx
 * <ResponsePane entry={entry} row={row} tab={tab} onTab={setTab} payload={payload} now={now} slowMs={500} sendingLabel={label} onInspect={open} onCancel={cancel} />
 * ```
 */
export function ResponsePane(props: ResponsePaneProps): React.ReactNode {
  const { entry, row, tab, onTab, payload, now, slowMs, sendingLabel, onInspect, onCancel } = props;
  const { onRunAsServer } = props;
  const tabs = tabsOf(entry, row);
  const shown = tabs.some((t) => t.value === tab) ? tab : (tabs[0]?.value ?? "body");
  return (
    <section aria-label="Response" className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-4.5 pt-3.5 pb-3">
        <div className="flex min-h-6.5 items-center gap-2">
          <h2 className="text-ui font-semibold">Response</h2>
          <div className="flex-1" />
          {row && (
            <button
              type="button"
              onClick={() => onInspect(row.id)}
              className="flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-2.25 text-small text-fg-muted transition-colors hover:border-line-strong hover:text-fg pointer-coarse:h-9 pointer-coarse:px-2.5"
            >
              <PanelRight aria-hidden="true" className="size-3" />
              Inspect
            </button>
          )}
        </div>
        <StatCellGrid cells={playgroundCells({ entry, row, now, slowMs })} />
        <Segmented label="Response" options={tabs} value={shown} onChange={onTab} quiet="subtle" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-inset">
        <ResponseContent
          entry={entry}
          row={row}
          tab={shown}
          payload={payload}
          now={now}
          sendingLabel={sendingLabel}
          onCancel={onCancel}
          onRunAsServer={onRunAsServer}
        />
      </div>
    </section>
  );
}
