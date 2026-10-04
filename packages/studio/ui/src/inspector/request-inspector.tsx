import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { useStudioStore } from "@/store";
import { InspectorSheet } from "./inspector-sheet";
import type { PayloadMode } from "./tabs/payload-tab";
import { useInspector } from "./use-inspector";

/**
 * The request inspector, over whatever page of the new shell shows: the
 * request the address names, its figures and its tabs. It slides in from
 * the window's edge and back out, the request it closes staying readable
 * while it goes; for someone whose system asks for less motion it only
 * fades. Esc closes it, unless a menu or a dialog takes the key first.
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
    requestId
      ? (s.requests.find((r) => r.id === requestId) ??
        s.heldRequests.find((r) => r.id === requestId))
      : undefined,
  );
  const [mode, setMode] = useState<PayloadMode>("tree");
  const [flavor, setFlavor] = useState<SnippetFlavor>("shell");
  const open = request !== undefined;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {request && (
          <InspectorSheet
            key="sheet"
            request={request}
            tab={tab}
            onTab={show}
            onClose={close}
            payload={{ mode, onMode: setMode }}
            snippets={{ flavor, onFlavor: setFlavor }}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
