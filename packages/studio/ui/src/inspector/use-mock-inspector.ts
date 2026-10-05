import { rootRouteId, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

/** The mock request open in its sheet, and what opens and closes it. */
export interface MockInspectorControl {
  requestId: string | undefined;
  open: (requestId: string) => void;
  close: () => void;
}

/**
 * The sheet of a request a mock answered, kept in the address of whatever
 * page shows it — `?mreq=…` — as the inspector keeps a request of the app's.
 * Opening one closes the inspector, and the other way round.
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
  const open = useCallback(
    (requestId: string) =>
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, req: undefined, tab: undefined, mreq: requestId }),
      }),
    [navigate],
  );
  const close = useCallback(
    () =>
      void navigate({ to: ".", search: (prev) => ({ ...prev, mreq: undefined, tab: undefined }) }),
    [navigate],
  );
  return { requestId: mreq, open, close };
}
