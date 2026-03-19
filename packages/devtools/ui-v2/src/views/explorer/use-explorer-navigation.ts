import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { useRequestDetail } from "@/hooks/use-request-detail";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExplorerNavigation {
  navigateToTimeline: (requestId?: string) => void;
  openPlayground: (source: string, group: string, method: string) => void;
  openGraph: (search?: string) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useExplorerNavigation(): ExplorerNavigation {
  const navigate = useNavigate();
  const { selectRequest } = useRequestDetail();

  const navigateToTimeline = useCallback(
    (requestId?: string) => {
      if (requestId) {
        selectRequest(requestId);
      } else {
        void navigate({ to: "/timeline" });
      }
    },
    [navigate, selectRequest],
  );

  const openPlayground = useCallback(
    (source: string, group: string, method: string) => {
      void navigate({
        to: "/playground",
        search: { source, group, method },
      });
    },
    [navigate],
  );

  const openGraph = useCallback(
    (search?: string) => {
      void navigate({
        to: "/explorer/graph",
        search: search ? { search } : {},
      });
    },
    [navigate],
  );

  return { navigateToTimeline, openPlayground, openGraph };
}
