import { Fragment } from "react";

import { ownRates } from "@/features/mocks/route-overrides";
import type { MockServerInfo } from "@/store/mock-slice";

/**
 * The routes a chaos mode does not fail as it fails the rest, under the
 * modes: each route whose override gives it an error rate of its own —
 * one that never fails while the mock is down, one that fails while it is
 * stable — so what the mock does is never a surprise. Nothing when there
 * are none.
 *
 * @param props - The mock server
 * @returns The note, or nothing
 * @example
 * ```tsx
 * <RouteRatesNote server={server} />
 * ```
 */
export function RouteRatesNote({ server }: { server: MockServerInfo }): React.ReactNode {
  const rates = ownRates(server);
  if (rates.length === 0) return null;
  return (
    <p className="-mt-1.5 text-small text-fg-subtle">
      With an error rate of their own:{" "}
      {rates.map((route, index) => (
        <Fragment key={route.routeId}>
          {index > 0 && ", "}
          <span className="font-mono text-fg">{route.name}</span>{" "}
          {route.rate === 0 ? "never fails" : `fails ${route.rate}%`}
        </Fragment>
      ))}
      . Per-route overrides set them.
    </p>
  );
}
