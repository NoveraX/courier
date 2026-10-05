import { rootRouteId, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import type { InspectorTab } from "@/features/requests/inspector-tabs";

/** The request open in the inspector, and what opens, switches and closes it. */
export interface InspectorControl {
  requestId: string | undefined;
  tab: InspectorTab | undefined;
  open: (requestId: string) => void;
  show: (tab: InspectorTab) => void;
  close: () => void;
}

/**
 * The inspector's state, kept in the address of whatever page of the new
 * shell shows — `?req=…&tab=…` — so a link or a reload opens the same
 * request on the same tab.
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
  const open = useCallback(
    (requestId: string) =>
      void navigate({ to: ".", search: (prev) => ({ ...prev, mreq: undefined, req: requestId }) }),
    [navigate],
  );
  const show = useCallback(
    (next: InspectorTab) =>
      void navigate({ to: ".", search: (prev) => ({ ...prev, tab: next }), replace: true }),
    [navigate],
  );
  const close = useCallback(
    () =>
      void navigate({ to: ".", search: (prev) => ({ ...prev, req: undefined, tab: undefined }) }),
    [navigate],
  );
  return { requestId: req, tab, open, show, close };
}
