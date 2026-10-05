import { Link } from "@tanstack/react-router";

import type { EndpointRow } from "@/features/analytics/endpoint-rows";
import { recentCallsOf } from "@/features/requests/recent-calls";
import { CallRow } from "@/request-list/call-row";

/* How many of an open endpoint's newest calls it lists. */
const CALLS_SHOWN = 8;

interface EndpointCallsProps {
  row: EndpointRow;
  slowMs: number;
  onOpenCall: (id: string) => void;
}

/**
 * An open endpoint's newest calls under its row, each opening in the
 * inspector, and — when it has more — how many older ones there are, with
 * the Timeline searched for the endpoint to see them all.
 *
 * @param props - The endpoint's row, the slow threshold, and what opens a call
 * @returns The calls
 * @example
 * ```tsx
 * <EndpointCalls row={row} slowMs={500} onOpenCall={open} />
 * ```
 */
export function EndpointCalls({ row, slowMs, onOpenCall }: EndpointCallsProps): React.ReactNode {
  const older = row.requests.length - CALLS_SHOWN;
  return (
    <div id={`calls-${row.key}`} className="bg-bg-subtle pt-1 pr-4.5 pb-2.5 pl-13">
      {recentCallsOf(row.requests, CALLS_SHOWN).map((call) => (
        <CallRow
          key={call.request.id}
          call={call}
          slowMs={slowMs}
          onOpen={onOpenCall}
          withSize
          className="h-7.5 rounded-[6px] px-2.5 hover:bg-raised"
        />
      ))}
      {older > 0 && (
        <p className="m-0 px-2.5 pt-1.5 text-label text-fg-subtle">
          + {older} older calls ·{" "}
          <Link
            to="/timeline"
            search={{ q: row.key }}
            className="text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            open Timeline to see all
          </Link>
        </p>
      )}
    </div>
  );
}
