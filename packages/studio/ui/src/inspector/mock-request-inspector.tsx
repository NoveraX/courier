import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect } from "react";

import { mockRequestView } from "@/features/mocks/mock-request-view";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { MockRequestSheet } from "./mock-request-sheet";
import { useInspector } from "./use-inspector";
import { useMockInspector } from "./use-mock-inspector";

/**
 * The sheet of a request a mock answered, over whatever page shows: the
 * request the address names — opened from the Mocks dashboard, its log or
 * its network figures — as the inspector shows a request of the app's.
 * Esc closes it, unless a menu or a dialog takes the key first.
 *
 * @returns The sheet, or nothing while no mock request is open
 * @example
 * ```tsx
 * <MockRequestInspector />
 * ```
 */
export function MockRequestInspector(): React.ReactNode {
  const { requestId, close } = useMockInspector();
  const { tab, show } = useInspector();
  const log = useMockStore((s) =>
    requestId ? s.logs.find((entry) => entry.id === requestId) : undefined,
  );
  const server = useMockStore((s) => (log ? s.servers[log.serverId] : undefined));
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const open = log !== undefined;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  const url = `${server?.url ?? ""}${log?.path ?? ""}`;
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {log && (
          <MockRequestSheet
            key="mock-sheet"
            log={log}
            view={mockRequestView(log, server?.url ?? "")}
            server={server?.name ?? log.serverId}
            url={url}
            now={now}
            slowMs={slowMs}
            tab={tab}
            onTab={show}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
