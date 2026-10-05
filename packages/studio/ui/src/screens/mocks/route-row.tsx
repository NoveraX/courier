import { ChevronDown, ChevronRight } from "lucide-react";

import { methodText } from "@/design/method-color";
import { durationTone } from "@/features/requests/duration-tone";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";
import { ROUTE_COLUMNS } from "./route-columns";
import { RouteDetail } from "./route-detail";

const KIND_TAG: Readonly<Record<MockRouteEntry["source"], string>> = {
  auto: "bg-raised text-fg-muted",
  override: "bg-warn-dim text-warn",
  scenario: "bg-syntax-keyword/12 text-syntax-keyword",
};
const AVG_TEXT = { normal: "text-fg", warn: "text-warn", err: "text-err" } as const;

interface RouteRowProps {
  route: MockRouteEntry;
  open: boolean;
  serverUrl: string;
  slowMs: number;
  onToggle: () => void;
}

/**
 * A route of the mock: its method, path and endpoint, what answers it, its
 * average time against the slow threshold and its hits — opened, what
 * answers it in words, how to call it and a sample answer.
 *
 * @param props - The route, whether it is open, the mock's address, the slow threshold, and what opening does
 * @returns The row
 * @example
 * ```tsx
 * <RouteRow route={route} open={false} serverUrl={server.url} slowMs={500} onToggle={toggle} />
 * ```
 */
export function RouteRow({
  route,
  open,
  serverUrl,
  slowMs,
  onToggle,
}: RouteRowProps): React.ReactNode {
  const Caret = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "grid min-h-10.5 w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left hover:bg-raised",
          ROUTE_COLUMNS,
          open && "bg-brand-tint",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Caret aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
          <span
            className={cn(
              "w-11 shrink-0 font-mono text-meta font-semibold",
              methodText(route.httpMethod.toUpperCase()),
            )}
          >
            {route.httpMethod.toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate font-mono text-control">{route.fullPath}</span>
            <span className="font-mono text-meta text-fg-subtle">
              {route.group}.{route.endpoint}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "flex h-5 items-center justify-self-start rounded-[5px] px-1.75 text-badge font-strong",
            KIND_TAG[route.source],
          )}
        >
          {route.source}
        </span>
        <span
          className={cn(
            "text-right font-mono text-small",
            route.hits ? AVG_TEXT[durationTone(route.avgLatency, slowMs)] : "text-fg-subtle",
          )}
        >
          {!route.hits ? "—" : route.avgLatency >= 1 ? formatDuration(route.avgLatency) : "<1ms"}
        </span>
        <span className="text-right font-mono text-small text-fg-muted tabular-nums">
          {route.hits}
        </span>
      </button>
      {open && <RouteDetail route={route} serverUrl={serverUrl} />}
    </div>
  );
}
