import { rootRouteId, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import { MEDIA } from "@/design/breakpoints";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { HistorySpot } from "./inspector-history";
import { closesByGoingBack } from "./inspector-history";

/** The mock request open in its sheet, and what opens and closes it. */
export interface MockInspectorControl {
  requestId: string | undefined;
  open: (requestId: string) => void;
  close: () => void;
}

/* The entry the sheet's last opening added, as the one browser history there is remembers
   it: closing goes back over it on a phone. */
let opened: HistorySpot | undefined;

/**
 * The sheet of a request a mock answered, kept in the address of whatever
 * page shows it — `?mreq=…` — as the inspector keeps a request of the app's.
 * Opening one closes the inspector, and the other way round. Opening adds a
 * history entry, so Back closes it. On a phone, where the sheet is a page of
 * its own, another request opened over it takes its place rather than adding
 * one, and closing goes back over the entry its opening added — so Back
 * after closing does not open it again, as with the inspector.
 *
 * @returns The request open, and what opens and closes it
 * @example
 * ```ts
 * const { open } = useMockInspector();
 * open(log.id);
 * ```
 */
export function useMockInspector(): MockInspectorControl {
  const { mreq } = useSearch({ from: rootRouteId });
  const navigate = useNavigate();
  const router = useRouter();
  const phone = useMediaQuery(MEDIA.phone);
  const spot = useCallback(
    (): HistorySpot => ({
      index: router.history.location.state.__TSR_index,
      path: router.history.location.pathname,
    }),
    [router],
  );
  const open = useCallback(
    (requestId: string) => {
      const over = phone && mreq !== undefined;
      const here = spot();
      if (!over) opened = { ...here, index: here.index + 1 };
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, req: undefined, tab: undefined, mreq: requestId }),
        replace: over,
      });
    },
    [navigate, phone, mreq, spot],
  );
  const close = useCallback(() => {
    if (closesByGoingBack(opened, spot(), phone)) {
      opened = undefined;
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, mreq: undefined, tab: undefined }),
      replace: phone,
    });
  }, [navigate, router, phone, spot]);
  return { requestId: mreq, open, close };
}
