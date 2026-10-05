import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { inspectorOf } from "@/features/requests/inspector-of";
import type { WaterfallView } from "@/features/waterfall/waterfall-search";
import { searchFromView, viewFromSearch } from "@/features/waterfall/waterfall-search";

/** The Waterfall's search, sort, grouping and mode, kept in its address. */
export interface WaterfallViewControl {
  view: WaterfallView;
  setView: (patch: Partial<WaterfallView>) => void;
}

/**
 * The Waterfall's view as its address keeps it, so a link or a reload
 * opens the same view — the inspector's request and tab kept alongside.
 *
 * @returns The view, and what changes it
 * @example
 * ```ts
 * const { view, setView } = useWaterfallView();
 * setView({ sort: "duration" });
 * ```
 */
export function useWaterfallView(): WaterfallViewControl {
  const search = useSearch({ from: "/waterfall" });
  const navigate = useNavigate({ from: "/waterfall" });
  const view = useMemo(() => viewFromSearch(search), [search]);
  const setView = useCallback(
    (patch: Partial<WaterfallView>) =>
      void navigate({
        search: (prev) => ({
          ...inspectorOf(prev),
          ...searchFromView({ ...view, ...patch }),
        }),
        replace: true,
      }),
    [navigate, view],
  );
  return { view, setView };
}
