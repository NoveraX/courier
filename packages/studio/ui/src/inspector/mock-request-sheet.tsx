import { motion } from "motion/react";
import { useState } from "react";

import { EASE_OUT, revealAfter, SWAP_DURATION } from "@/design/motion";
import { Reveal } from "@/design/reveal";
import { SheetFrame } from "@/design/sheet-frame";
import { mockRequestCells } from "@/features/mocks/mock-request-cells";
import type { MockRequestView } from "@/features/mocks/mock-request-view";
import type { InspectorTab } from "@/features/requests/inspector-tabs";
import { downloadWholeBody } from "@/mocks/download-whole-body";
import { mockWhole } from "@/mocks/mock-whole";
import type { MockRequestLog } from "@/store/mock-slice";
import { MockRequestHeader } from "./mock-request-header";
import { StatCellGrid } from "./stat-cell-grid";
import { TabBar } from "./tab-bar";
import { MockCurlTab } from "./tabs/mock-curl-tab";
import { MockHeadersTab } from "./tabs/mock-headers-tab";
import type { PayloadMode } from "./tabs/payload-tab";
import { PayloadTab } from "./tabs/payload-tab";

interface MockRequestSheetProps {
  log: MockRequestLog;
  view: MockRequestView;
  server: string;
  url: string;
  now: number;
  slowMs: number;
  tab: InspectorTab | undefined;
  onTab: (tab: InspectorTab) => void;
  onClose: () => void;
}

interface ContentProps {
  log: MockRequestLog;
  view: MockRequestView;
  tab: InspectorTab;
}

function Content({ log, view, tab }: ContentProps): React.ReactNode {
  const [mode, setMode] = useState<PayloadMode>("tree");
  if (tab === "headers") return <MockHeadersTab groups={view.headers} />;
  if (tab === "snippets")
    return (
      <MockCurlTab
        view={view}
        bodyBytes={log.variablesCutFrom}
        onWhole={() => void downloadWholeBody(log, "request")}
      />
    );
  const part = tab === "request" ? "request" : "response";
  return (
    <PayloadTab
      view={view[part]}
      mode={mode}
      onMode={setMode}
      onWhole={() => void downloadWholeBody(log, part)}
      whole={mockWhole(log, part)}
      searchLabel={part === "request" ? "Find in the request" : "Find in the answer"}
    />
  );
}

/**
 * The sheet of a request a mock answered, as the inspector shows one of the
 * app's: it comes in from the window's edge with its parts following — the
 * request, its figures, its tabs, then the tab — and goes back the way it came.
 *
 * @param props - The request, what its tabs show, the mock's name and address, the time, the slow threshold, the tab, and what switches and closes
 * @returns The sheet
 * @example
 * ```tsx
 * <MockRequestSheet log={log} view={view} server="shop" url={url} now={now} slowMs={500} tab={tab} onTab={show} onClose={close} />
 * ```
 */
export function MockRequestSheet(props: MockRequestSheetProps): React.ReactNode {
  const { log, view, server, url, now, slowMs, onTab, onClose } = props;
  const [opening, setOpening] = useState(true);
  const tab = view.tabs.some((t) => t.key === props.tab) ? (props.tab ?? "response") : "response";
  return (
    <SheetFrame
      label="Mock request"
      width="w-[min(480px,calc(100vw-16px))]"
      layer="inspector"
      onShown={() => setOpening(false)}
    >
      <motion.div
        key={log.id}
        initial={opening ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: SWAP_DURATION, ease: EASE_OUT }}
        className="flex shrink-0 flex-col gap-3.5 border-b border-line pt-4 pr-3.5 pl-4.5"
      >
        <Reveal step={0} play={opening}>
          <MockRequestHeader
            log={log}
            server={server}
            url={url}
            curl={view.curl}
            onClose={onClose}
          />
        </Reveal>
        <Reveal step={1} play={opening}>
          <StatCellGrid cells={mockRequestCells(log, now, slowMs)} />
        </Reveal>
        <Reveal step={2} play={opening}>
          <TabBar tabs={view.tabs} current={tab} onSelect={onTab} />
        </Reveal>
      </motion.div>
      <motion.div
        key={`${log.id}:${tab}`}
        role="tabpanel"
        initial={{ opacity: 0, y: opening ? 6 : 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={opening ? revealAfter(3) : { duration: SWAP_DURATION, ease: EASE_OUT }}
        className="min-h-0 flex-1 overflow-auto"
      >
        <Content log={log} view={view} tab={tab} />
      </motion.div>
    </SheetFrame>
  );
}
