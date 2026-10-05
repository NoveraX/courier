import { AnimatePresence, MotionConfig } from "motion/react";
import { useCallback, useEffect } from "react";

import { useNow } from "@/hooks/use-tick";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { EndpointSheet } from "./endpoint-sheet";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

interface OpenEndpointProps {
  endpointKey: string;
  onClose: () => void;
}

/* The open endpoint's sheet; it keeps the key it opened with, so it stays readable while it slides out. */
function OpenEndpoint({ endpointKey, onClose }: OpenEndpointProps): React.ReactNode {
  const model = useExplorerModel();
  const { open } = useInspector();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const endpoint = model.endpoints.find((e) => e.key === endpointKey);
  if (!endpoint) return null;
  return (
    <EndpointSheet
      endpoint={endpoint}
      now={now}
      slowMs={slowMs}
      onClose={onClose}
      onOpenCall={open}
    />
  );
}

/**
 * The panel of the endpoint the address names, over whichever Explorer tab
 * shows. It slides in like the inspector and sits just under it, so a call
 * opened from it comes up on top and closing that call returns to the
 * endpoint. Esc closes it once no request is open over it.
 *
 * @returns The panel, or nothing while no endpoint is open
 * @example
 * ```tsx
 * <EndpointPanel />
 * ```
 */
export function EndpointPanel(): React.ReactNode {
  const { endpoint: key, set } = useExplorerSearch();
  const { requestId } = useInspector();
  const close = useCallback(() => set({ endpoint: undefined }), [set]);
  const listening = key !== undefined && requestId === undefined;
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, close]);
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {key && <OpenEndpoint key="endpoint" endpointKey={key} onClose={close} />}
      </AnimatePresence>
    </MotionConfig>
  );
}
