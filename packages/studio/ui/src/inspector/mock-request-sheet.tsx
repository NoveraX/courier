import { motion } from "motion/react";
import { useState } from "react";

import { CodeLines } from "@/design/code/code-lines";
import { EASE_OUT, revealAfter, SHEET_VARIANTS, SWAP_DURATION } from "@/design/motion";
import { Reveal } from "@/design/reveal";
import { mockRequestCells } from "@/features/mocks/mock-request-cells";
import type { MockRequestView } from "@/features/mocks/mock-request-view";
import type { InspectorTab } from "@/features/requests/inspector-tabs";
import { copyToClipboard } from "@/lib/clipboard";
import type { MockRequestLog } from "@/store/mock-slice";
import { MockRequestHeader } from "./mock-request-header";
import { StatCellGrid } from "./stat-cell-grid";
import { TabBar } from "./tab-bar";
import { CodeToolbar } from "./tabs/code-toolbar";
import { MockHeadersTab } from "./tabs/mock-headers-tab";
import type { PayloadMode } from "./tabs/payload-tab";
import { PayloadTab } from "./tabs/payload-tab";

const CURL_MODES = [{ value: "curl", label: "cURL" }] as const;

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

function Content({ view, tab }: { view: MockRequestView; tab: InspectorTab }): React.ReactNode {
  const [mode, setMode] = useState<PayloadMode>("tree");
  if (tab === "headers") return <MockHeadersTab groups={view.headers} />;
  if (tab === "snippets")
    return (
      <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
        <CodeToolbar
          label="Snippet"
          modes={CURL_MODES}
          mode="curl"
          onMode={() => {}}
          chips={view.redacted ? [{ label: "credentials redacted", tone: "muted" }] : []}
          onCopy={() => void copyToClipboard(view.curl, "the snippet")}
        />
        <div className="overflow-hidden rounded-panel border border-line bg-inset">
          <CodeLines variant="panel" code={view.curl} />
        </div>
      </div>
    );
  const payload = tab === "request" ? view.request : view.response;
  return <PayloadTab view={payload} mode={mode} onMode={setMode} />;
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
    <motion.aside
      aria-label="Mock request"
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
        <Content view={view} tab={tab} />
      </motion.div>
    </motion.aside>
  );
}
