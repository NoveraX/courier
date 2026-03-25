import { useCallback } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import type { DetailTabKey } from "@/components/shared/detail-panel/constants";

interface RequestDetailState {
  selectedId: string | null;
  detailTab: DetailTabKey;
  selectRequest: (id: string, tab?: DetailTabKey) => void;
  setDetailTab: (tab: DetailTabKey) => void;
  closePanel: () => void;
}

/** Global hook for request detail panel — reads/writes root-level search params */
export function useRequestDetail(): RequestDetailState {
  const router = useRouter();
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;

  const selectedId = (search.selectedReq as string) ?? null;
  const detailTab = ((search.detailTab as string) ?? "general") as DetailTabKey;

  const updateSearch = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      const current = router.state.location.search as Record<string, unknown>;
      void router.navigate({
        to: ".",
        search: updater(current) as never,
        replace: true,
      });
    },
    [router],
  );

  const selectRequest = useCallback(
    (id: string, tab: DetailTabKey = "general") => {
      updateSearch((prev) => ({ ...prev, selectedReq: id, detailTab: tab }));
    },
    [updateSearch],
  );

  const setDetailTab = useCallback(
    (tab: DetailTabKey) => {
      updateSearch((prev) => ({ ...prev, detailTab: tab }));
    },
    [updateSearch],
  );

  const closePanel = useCallback(() => {
    updateSearch((prev) => {
      const next = { ...prev };
      delete next.selectedReq;
      delete next.detailTab;
      return next;
    });
  }, [updateSearch]);

  return { selectedId, detailTab, selectRequest, setDetailTab, closePanel };
}
