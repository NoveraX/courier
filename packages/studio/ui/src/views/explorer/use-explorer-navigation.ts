import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExplorerNavigation {
  navigateToTimeline: (requestId?: string) => void;
  openPlayground: (source: string, group: string, method: string) => void;
  openGraph: (search?: string) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useExplorerNavigation(): ExplorerNavigation {
  const navigate = useNavigate();

  const navigateToTimeline = useCallback(
    (requestId?: string) => {
      void navigate({
        to: "/timeline",
        search: requestId ? { selectedReq: requestId, detailTab: "general" } : {},
      });
    },
    [navigate],
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
