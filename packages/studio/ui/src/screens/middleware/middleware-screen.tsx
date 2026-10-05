import { useNavigate, useSearch } from "@tanstack/react-router";
import { LayoutDashboard, Workflow } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { endpointImpact } from "@/features/middleware/endpoint-impact";
import type { MiddlewareSearch, MiddlewareView } from "@/features/middleware/middleware-search";
import { middlewareOverview, traced } from "@/features/middleware/middleware-stats";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { ChainView } from "./chain-view";
import { ImpactTable } from "./impact-table";
import { MiddlewareCards } from "./middleware-cards";
import type { MiddlewareLook } from "./middleware-look";
import { lookOf } from "./middleware-look";
import { OverheadHero } from "./overhead-hero";

const VIEWS: readonly SegmentedOption<MiddlewareView>[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "chain", label: "Chain inspector", icon: Workflow },
];

function NoMiddleware(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-dialog border border-line bg-panel px-6 py-16 text-center">
      <Workflow aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="m-0 text-ui font-strong">No call has run through middleware yet</p>
      <p className="m-0 max-w-100 text-small text-fg-subtle">
        Middleware declared on an API, a group or an endpoint shows here once a call runs through
        it: what each one costs, and every call's chain step by step.
      </p>
    </div>
  );
}

/**
 * The Middleware page: what the session's middleware costs — its share
 * of the calls' time, each middleware's calls, time, failures and headers,
 * the endpoints it weighs on most — and the chain inspector, one call
 * traced through every step.
 *
 * @returns The page
 * @example
 * ```tsx
 * <MiddlewareScreen />
 * ```
 */
export function MiddlewareScreen(): React.ReactNode {
  const search: MiddlewareSearch = useSearch({ from: "/middleware" });
  const navigate = useNavigate({ from: "/middleware" });
  const { open } = useInspector();
  const calls = traced(useStudioStore((s) => s.requests));
  const overview = middlewareOverview(calls);
  const looks = new Map<string, MiddlewareLook>(
    overview.stats.map((s, i) => [s.name, lookOf(s.name, i, s.phase)]),
  );
  const view: MiddlewareView = search.view ?? "overview";
  /* Opening a chain or switching the view is a step the browser's Back undoes; picking another call in the chain is not. */
  const go = (next: MiddlewareSearch, step = false): void =>
    void navigate({
      search: (prev) => ({ ...inspectorOf(prev), ...next }),
      replace: !step,
    });
  const trace = (id: string): void => go({ view: "chain", trace: id }, true);
  const traceMiddleware = (name: string): void => {
    const ran = calls.filter((r) => r.middlewareEntries.some((e) => e.name === name));
    const failed = ran.find((r) =>
      r.middlewareEntries.some((e) => e.name === name && e.status === "error"),
    );
    const pick = failed ?? ran[0];
    if (pick) trace(pick.id);
  };
  const chosen = calls.find((r) => r.id === search.trace) ?? calls[0];
  return (
    <div className="mx-auto flex w-full max-w-320 flex-col gap-4.5 px-6 pt-6 pb-12">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Middleware</h1>
          <span className="text-control text-fg-subtle">{`${overview.stats.length} middleware · ${calls.length} requests traced`}</span>
        </div>
        <div className="flex-1" />
        <Segmented
          label="View"
          options={VIEWS}
          value={view}
          onChange={(v) =>
            go({ view: v === "chain" ? "chain" : undefined, trace: search.trace }, true)
          }
        />
      </header>
      {!chosen && <NoMiddleware />}
      {chosen && view === "overview" && (
        <>
          <OverheadHero overview={overview} looks={looks} />
          <MiddlewareCards stats={overview.stats} looks={looks} onTrace={traceMiddleware} />
          <ImpactTable rows={endpointImpact(calls)} looks={looks} onTrace={trace} />
        </>
      )}
      {chosen && view === "chain" && (
        <ChainView
          calls={calls}
          chosen={chosen}
          looks={looks}
          onChoose={(id) => go({ view: "chain", trace: id })}
          onInspect={open}
        />
      )}
    </div>
  );
}
