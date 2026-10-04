import { motion } from "motion/react";
import { useState } from "react";

import { EASE_OUT, revealAfter, SHEET_VARIANTS, SWAP_DURATION } from "@/design/motion";
import { Reveal } from "@/design/reveal";
import type { InspectorTab } from "@/features/requests/inspector-tabs";
import { inspectorTabsOf, shownTab } from "@/features/requests/inspector-tabs";
import { statCellsOf } from "@/features/requests/stat-cells";
import { endpointLatency } from "@/features/requests/throughput";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { InspectorHeader } from "./inspector-header";
import { StatCellGrid } from "./stat-cell-grid";
import { TabBar } from "./tab-bar";
import type { PayloadControls, SnippetControls } from "./tab-content";
import { TabContent } from "./tab-content";
import { useReplay } from "./use-replay";
import { useStopStream } from "./use-stop-stream";

interface InspectorSheetProps {
  request: RequestEntry;
  tab: InspectorTab | undefined;
  onTab: (tab: InspectorTab) => void;
  onClose: () => void;
  payload: PayloadControls;
  snippets: SnippetControls;
}

/**
 * The inspector's sheet: it comes in from the window's edge with its parts
 * following — the request's name, its figures, its tabs, then the tab —
 * and goes back the way it came. Once it is open, another request or tab
 * takes its place with a short fade, with no choreography to wait on.
 *
 * @param props - The request, the tab open, and what the sheet's controls change
 * @returns The sheet
 * @example
 * ```tsx
 * <AnimatePresence>
 *   {request && <InspectorSheet key="sheet" request={request} {...controls} />}
 * </AnimatePresence>
 * ```
 */
export function InspectorSheet(props: InspectorSheetProps): React.ReactNode {
  const { request, tab, onTab, onClose, payload, snippets } = props;
  const [opening, setOpening] = useState(true);
  const current = shownTab(request, tab);
  return (
    <motion.aside
      aria-label="Request inspector"
      variants={SHEET_VARIANTS}
      initial="hidden"
      animate="shown"
      exit="gone"
      onAnimationComplete={(definition) => {
        if (definition === "shown") setOpening(false);
      }}
      style={{ originX: 1 }}
      className="fixed top-2 right-2 bottom-8 z-40 flex w-[min(480px,calc(100vw-16px))] flex-col overflow-hidden rounded-sheet border border-line-strong bg-panel shadow-overlay"
    >
      <Head
        key={request.id}
        request={request}
        current={current}
        onTab={onTab}
        onClose={onClose}
        opening={opening}
      />
      <motion.div
        key={`${request.id}:${current}`}
        role="tabpanel"
        initial={{ opacity: 0, y: opening ? 6 : 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={opening ? revealAfter(3) : { duration: SWAP_DURATION, ease: EASE_OUT }}
        className="min-h-0 flex-1 overflow-auto"
      >
        <TabContent request={request} current={current} payload={payload} snippets={snippets} />
      </motion.div>
    </motion.aside>
  );
}

interface HeadProps {
  request: RequestEntry;
  current: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onClose: () => void;
  opening: boolean;
}

function Head({ request, current, onTab, onClose, opening }: HeadProps): React.ReactNode {
  const now = useNow();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const p95 = useStudioStore((s) => endpointLatency(s.requests, request)?.p95 ?? null);
  const replay = useReplay();
  const stopStream = useStopStream();
  return (
    <motion.div
      initial={opening ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: SWAP_DURATION, ease: EASE_OUT }}
      className="flex shrink-0 flex-col gap-3.5 border-b border-line pt-4 pr-3.5 pl-4.5"
    >
      <Reveal step={0} play={opening}>
        <InspectorHeader
          request={request}
          replay={replay(request)}
          stop={stopStream(request)}
          onClose={onClose}
        />
      </Reveal>
      <Reveal step={1} play={opening}>
        <StatCellGrid cells={statCellsOf(request, { now, slowMs, p95 })} />
      </Reveal>
      <Reveal step={2} play={opening}>
        <TabBar tabs={inspectorTabsOf(request)} current={current} onSelect={onTab} />
      </Reveal>
    </motion.div>
  );
}
