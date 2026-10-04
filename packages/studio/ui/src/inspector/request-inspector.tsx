import { useEffect, useState } from "react";

import { inspectorTabsOf, shownTab } from "@/features/requests/inspector-tabs";
import { requestView, responseView } from "@/features/requests/payload-view";
import { failureOf } from "@/features/requests/request-failure";
import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { statCellsOf } from "@/features/requests/stat-cells";
import { endpointLatency } from "@/features/requests/throughput";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { InspectorHeader } from "./inspector-header";
import { StatCellGrid } from "./stat-cell-grid";
import { TabBar } from "./tab-bar";
import { FailureTab } from "./tabs/failure-tab";
import { HeadersTab } from "./tabs/headers-tab";
import { MessagesTab } from "./tabs/messages-tab";
import { OverviewTab } from "./tabs/overview-tab";
import type { PayloadMode } from "./tabs/payload-tab";
import { PayloadTab } from "./tabs/payload-tab";
import { SnippetsTab } from "./tabs/snippets-tab";
import { TimingTab } from "./tabs/timing-tab";
import { useInspector } from "./use-inspector";
import { useReplay } from "./use-replay";

/**
 * The request inspector, over whatever page of the new shell shows: the
 * request the address names, its figures and its tabs. Esc closes it,
 * unless a menu or a dialog takes the key first.
 *
 * @returns The inspector, or nothing while no request is open
 * @example
 * ```tsx
 * <RequestInspector />
 * ```
 */
export function RequestInspector(): React.ReactNode {
  const { requestId, tab, show, close } = useInspector();
  const request = useStudioStore((s) =>
    requestId ? s.requests.find((r) => r.id === requestId) : undefined,
  );
  const [mode, setMode] = useState<PayloadMode>("tree");
  const [flavor, setFlavor] = useState<SnippetFlavor>("shell");
  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, close]);
  if (!request) return null;
  const current = shownTab(request, tab);
  return (
    <aside
      aria-label="Request inspector"
      className="fixed top-2 right-2 bottom-8 z-40 flex w-[min(480px,calc(100vw-16px))] animate-sheet-in flex-col overflow-hidden rounded-sheet border border-line-strong bg-panel shadow-overlay"
    >
      <Head request={request} current={current} onTab={show} onClose={close} />
      <div key={request.id} role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {current === "overview" && <OverviewTab request={request} />}
        {current === "failure" && <Failure request={request} />}
        {current === "response" && (
          <PayloadTab view={responseView(request)} mode={mode} onMode={setMode} />
        )}
        {current === "request" && (
          <PayloadTab view={requestView(request)} mode={mode} onMode={setMode} />
        )}
        {current === "headers" && <HeadersTab request={request} />}
        {current === "timing" && <TimingTab request={request} />}
        {current === "snippets" && (
          <SnippetsTab request={request} flavor={flavor} onFlavor={setFlavor} />
        )}
        {current === "messages" && <MessagesTab request={request} />}
      </div>
    </aside>
  );
}

interface HeadProps {
  request: RequestEntry;
  current: ReturnType<typeof shownTab>;
  onTab: (tab: ReturnType<typeof shownTab>) => void;
  onClose: () => void;
}

function Head({ request, current, onTab, onClose }: HeadProps): React.ReactNode {
  const now = useNow();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const p95 = useStudioStore((s) => endpointLatency(s.requests, request)?.p95 ?? null);
  const replay = useReplay();
  return (
    <div className="flex shrink-0 flex-col gap-3.5 border-b border-line pt-4 pr-3.5 pl-4.5">
      <InspectorHeader request={request} onReplay={replay(request)} onClose={onClose} />
      <StatCellGrid cells={statCellsOf(request, { now, slowMs, p95 })} />
      <TabBar tabs={inspectorTabsOf(request)} current={current} onSelect={onTab} />
    </div>
  );
}

function Failure({ request }: { request: RequestEntry }): React.ReactNode {
  const failure = failureOf(request);
  return failure ? <FailureTab request={request} failure={failure} /> : null;
}
