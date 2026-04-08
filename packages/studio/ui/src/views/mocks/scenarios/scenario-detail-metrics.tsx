/**
 * Metric strip + coverage bar + description block for the scenario detail panel.
 *
 * Pulled out of `scenario-detail.tsx` so the parent file only composes
 * sections, while purely presentational rows live here. Renders nothing when
 * there is no data to show — callers don't need to gate the call themselves.
 */

import { Tag } from "lucide-react";

import { cn } from "@/lib/utils";

import type { MockScenarioEntry } from "@/store/mock-slice";

interface ScenarioDetailMetricsProps {
  scenario: MockScenarioEntry;
  totalRoutes: number;
  coverage: number;
  okCount: number;
  errorCount: number;
  seqCount: number;
}

export function ScenarioDetailMetrics({
  scenario,
  totalRoutes,
  coverage,
  okCount,
  errorCount,
  seqCount,
}: ScenarioDetailMetricsProps): React.ReactElement {
  const tags = scenario.tags ?? [];

  return (
    <>
      {scenario.endpointCount > 0 && (
        <div className="flex items-stretch divide-x divide-border-subtle/60 border-b border-border-subtle">
          {totalRoutes > 0 && <MetricCell label="Coverage" value={`${coverage}%`} />}
          <MetricCell label="Endpoints" value={String(scenario.endpointCount)} />
          {okCount > 0 && <MetricCell label="OK" value={String(okCount)} valueClass="text-emerald-500" />}
          {errorCount > 0 && <MetricCell label="Errors" value={String(errorCount)} valueClass="text-rose-500" />}
          {seqCount > 0 && <MetricCell label="Seq" value={String(seqCount)} valueClass="text-indigo-500" />}
        </div>
      )}

      {totalRoutes > 0 && scenario.endpointCount > 0 && (
        <div className="border-b border-border-subtle px-5 py-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div className="h-full rounded-full bg-accent-brand/50 transition-all" style={{ width: `${coverage}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between">
            <span className="text-caption text-muted-foreground/40">Route coverage</span>
            <span className="text-caption tabular-nums text-muted-foreground/50">
              {scenario.endpointCount} / {totalRoutes}
            </span>
          </div>
        </div>
      )}

      {(scenario.description || tags.length > 0) && (
        <div className="border-b border-border-subtle px-5 py-4 space-y-3">
          {scenario.description && (
            <p className="text-body-xs leading-relaxed text-muted-foreground/65">{scenario.description}</p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="size-3 shrink-0 text-muted-foreground/30" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-muted/60 px-2 py-0.5 text-caption text-muted-foreground/60 ring-1 ring-border-subtle"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface MetricCellProps {
  label: string;
  value: string;
  valueClass?: string;
}

function MetricCell({ label, value, valueClass }: MetricCellProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 py-3.5">
      <span className={cn("text-xl font-bold tabular-nums leading-none", valueClass ?? "text-foreground/80")}>
        {value}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{label}</span>
    </div>
  );
}
