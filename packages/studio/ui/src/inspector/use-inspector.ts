import type { RouterHistory } from "@tanstack/react-router";
import { rootRouteId, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import { MEDIA } from "@/design/breakpoints";
import type { InspectorTab } from "@/features/requests/inspector-tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { HistorySpot } from "./inspector-history";
import { closesByGoingBack } from "./inspector-history";

/** The request open in the inspector, and what opens, switches and closes it. */
export interface InspectorControl {
  requestId: string | undefined;
  tab: InspectorTab | undefined;
  open: (requestId: string) => void;
  show: (tab: InspectorTab) => void;
  close: () => void;
}

/* The history entry the inspector's latest opening added, which closing goes
   back over on a phone. The page has one history, so one record serves every
   view that opens the inspector. */
let opened: HistorySpot | undefined;

/**
 * The inspector's state, kept in the address of whatever page of the new
 * shell shows — `?req=…&tab=…` — so a link or a reload opens the same
 * request on the same tab. Opening a request adds a history entry, so Back
 * closes it. On a phone, where the inspector is a page of its own, another
 * request opened over it takes its place rather than adding one, and
 * closing it goes back over the entry its opening added — so Back after
 * closing does not open it again.
 *
 * @returns The request and tab open, and what changes them
 * @example
 * ```ts
 * const { open } = useInspector();
 * open(request.id);
 * ```
 */
export function useInspector(): InspectorControl {
  const { req, tab } = useSearch({ from: rootRouteId });
  const navigate = useNavigate();
  const router = useRouter();
  const phone = useMediaQuery(MEDIA.phone);
  const open = useCallback(
    (requestId: string) => {
      const over = phone && req !== undefined;
      const here = spotOf(router.history);
      if (!over) opened = { ...here, index: here.index + 1 };
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, mreq: undefined, req: requestId }),
        replace: over,
      });
    },
    [navigate, router, phone, req],
  );
  const show = useCallback(
    (next: InspectorTab) =>
      void navigate({ to: ".", search: (prev) => ({ ...prev, tab: next }), replace: true }),
    [navigate],
  );
  const close = useCallback(() => {
    if (closesByGoingBack(opened, spotOf(router.history), phone)) {
      opened = undefined;
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, req: undefined, tab: undefined }),
      replace: phone,
    });
  }, [navigate, router, phone]);
  return { requestId: req, tab, open, show, close };
}

/* Where the history is now: the entry's place, and its page. */
function spotOf({ location }: RouterHistory): HistorySpot {
  return { index: location.state.__TSR_index, path: location.pathname };
}
