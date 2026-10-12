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
  upstream: "bg-syntax-type/12 text-syntax-type",
  fixtures: "bg-ok-dim text-ok",
};
const KIND_WORD: Readonly<Record<MockRouteEntry["source"], string>> = {
  auto: "auto",
  override: "override",
  scenario: "scenario",
  upstream: "your server",
  fixtures: "recorded",
};
const AVG_TEXT = { normal: "text-fg", warn: "text-warn", err: "text-err" } as const;

interface RouteRowProps {
  route: MockRouteEntry;
  open: boolean;
  /** Two lines in place of the table's columns, in a list too narrow for them. */
  stacked: boolean;
  serverUrl: string;
  slowMs: number;
  onToggle: () => void;
}

/**
 * A route of the mock: its method, path and endpoint, what answers it, its
 * average time against the slow threshold and its hits — in the table's
 * columns, or on two lines in a narrow list — opened, what answers it in
 * words, how to call it and a sample answer.
 *
 * @param props - The route, whether it is open and stacked, the mock's address, the slow threshold, and what opening does
 * @returns The row
 * @example
 * ```tsx
 * <RouteRow route={route} open={false} stacked={false} serverUrl={server.url} slowMs={500} onToggle={toggle} />
 * ```
 */
export function RouteRow(props: RouteRowProps): React.ReactNode {
  const { route, open, stacked, serverUrl, slowMs, onToggle } = props;
  const Caret = open ? ChevronDown : ChevronRight;
  const method = route.httpMethod.toUpperCase();
  const avg = !route.hits ? "—" : route.avgLatency >= 1 ? formatDuration(route.avgLatency) : "<1ms";
  const avgText = route.hits ? AVG_TEXT[durationTone(route.avgLatency, slowMs)] : "text-fg-subtle";
  const endpoint = `${route.group}.${route.endpoint}`;
  const tag = (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center justify-self-start rounded-[5px] px-1.75 text-badge font-strong whitespace-nowrap",
        KIND_TAG[route.source],
      )}
    >
      {KIND_WORD[route.source]}
    </span>
  );
  const head = (
    <>
      <Caret aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
      <span className={cn("w-11 shrink-0 font-mono text-meta font-semibold", methodText(method))}>
        {method}
      </span>
    </>
  );
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "w-full cursor-pointer px-4 text-left hover:bg-raised",
          stacked
            ? "flex min-h-13 flex-col justify-center gap-1 py-2"
            : cn(
                "grid min-h-10.5 items-center gap-3 py-1.5 pointer-coarse:min-h-11",
                ROUTE_COLUMNS,
              ),
          open && "bg-brand-tint",
        )}
      >
        {stacked ? (
          <>
            <span className="flex min-w-0 items-center gap-2.5">
              {head}
              <span className="min-w-0 flex-1 truncate font-mono text-control">
                {route.fullPath}
              </span>
              {tag}
            </span>
            <span className="flex min-w-0 items-baseline gap-2.5 pl-5.5 font-mono">
              <span className="min-w-0 flex-1 truncate text-meta text-fg-subtle">{endpoint}</span>
              <span className="shrink-0 text-small whitespace-nowrap text-fg-muted tabular-nums">
                {route.hits ? (
                  <>
                    <span className={avgText}>{avg}</span> avg · {route.hits}{" "}
                    {route.hits === 1 ? "hit" : "hits"}
                  </>
                ) : (
                  "no hits"
                )}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2.5">
              {head}
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate font-mono text-control">{route.fullPath}</span>
                <span className="font-mono text-meta text-fg-subtle">{endpoint}</span>
              </span>
            </span>
            {tag}
            <span className={cn("text-right font-mono text-small", avgText)}>{avg}</span>
            <span className="text-right font-mono text-small text-fg-muted tabular-nums">
              {route.hits}
            </span>
          </>
        )}
      </button>
      {open && <RouteDetail route={route} serverUrl={serverUrl} stacked={stacked} />}
    </div>
  );
}
