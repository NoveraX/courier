import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { methodText } from "@/design/method-color";
import type { FindingEndpoint } from "@/features/audit/finding-view";
import { cn } from "@/lib/utils";

/* How many endpoints a finding lists until asked for all. */
const SHOWN = 5;

const VIEW =
  "flex items-center gap-1.25 justify-self-end text-label whitespace-nowrap text-fg-subtle hover:text-fg";

interface FindingEndpointsProps {
  endpoints: readonly FindingEndpoint[];
  /** The finding's colour, for what was seen at each endpoint. */
  tone: string;
  onOpenCall: (id: string) => void;
}

/**
 * The endpoints a finding names: method, name, what was seen there, and
 * a way to their calls — the Timeline searched for the endpoint, or its
 * first call in the inspector when the finding names no endpoint.
 *
 * @param props - The endpoints, the finding's colour, and what opens a call
 * @returns The table
 * @example
 * ```tsx
 * <FindingEndpoints endpoints={findingEndpoints(item, byId)} tone="text-err" onOpenCall={open} />
 * ```
 */
export function FindingEndpoints({
  endpoints,
  tone,
  onOpenCall,
}: FindingEndpointsProps): React.ReactNode {
  const [all, setAll] = useState(false);
  const shown = all ? endpoints : endpoints.slice(0, SHOWN);
  return (
    <div className="flex max-w-190 flex-col gap-1.5">
      <span className="text-label font-semibold text-fg-muted">Affected endpoints</span>
      <div className="overflow-hidden rounded-panel border border-line bg-panel">
        {shown.map((e) => (
          <div
            key={e.key}
            className="grid min-h-9.5 grid-cols-[44px_minmax(0,1fr)_auto_120px] items-center gap-3 border-b border-line px-3 last:border-b-0"
          >
            <span
              className={cn(
                "font-mono text-meta font-semibold",
                e.method ? methodText(e.method) : "text-fg-subtle",
              )}
            >
              {e.method ?? "—"}
            </span>
            <span className="truncate font-mono text-small">
              <span className="text-fg-subtle">{e.prefix}</span>
              {e.name}
            </span>
            <span className={cn("font-mono text-label whitespace-nowrap", tone)}>{e.detail}</span>
            {e.timelineQuery ? (
              <Link to="/next/timeline" search={{ q: e.timelineQuery }} className={VIEW}>
                View calls
                <ArrowUpRight aria-hidden="true" className="size-2.75" />
              </Link>
            ) : e.firstRequestId ? (
              <button
                type="button"
                onClick={() => e.firstRequestId && onOpenCall(e.firstRequestId)}
                className={cn(VIEW, "cursor-pointer")}
              >
                View call
                <ArrowUpRight aria-hidden="true" className="size-2.75" />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {endpoints.length > SHOWN && (
          <button
            type="button"
            onClick={() => setAll((on) => !on)}
            className="w-full cursor-pointer px-3 py-2 text-left text-label text-fg-muted hover:bg-raised hover:text-fg"
          >
            {all ? "Show fewer" : `Show ${endpoints.length - SHOWN} more`}
          </button>
        )}
      </div>
    </div>
  );
}
