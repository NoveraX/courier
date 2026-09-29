import { ArrowUpDown, Clock, FileKey } from "lucide-react";

import { formatDuration } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";

import type { RequestEntry } from "@/store/types";
import { ComparisonRow, Section, StatusBadge, TimingRow } from "./chain-context-parts";
import type { AggregateMiddleware, ChainEntry } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface ChainContextProps {
  request: RequestEntry;
  chain: ChainEntry;
  aggregateStats: AggregateMiddleware[];
}

// ── Component ──────────────────────────────────────────────────────────────

export function ChainContext({
  request,
  chain,
  aggregateStats,
}: ChainContextProps): React.ReactElement {
  const timing = request.timing;
  const stepsWithHeaders = chain.steps.filter((s) => s.headersAdded && s.headersAdded.length > 0);

  return (
    <div className="space-y-4">
      {/* Request info */}
      <Section title="Request">
        <div className="flex items-center gap-2">
          <MethodBadge method={request.httpMethod ?? "GET"} />
          <span className="mono-sm truncate text-foreground">
            {request.source}.{request.group ?? ""}.{request.method}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge request={request} />
          {timing && (
            <span className="mono-xs tabular-nums text-muted-foreground">
              {formatDuration(timing.total)}
            </span>
          )}
        </div>
      </Section>

      {/* Timing breakdown */}
      {timing && (
        <Section title="Timing Breakdown">
          <TimingRow
            label="Middleware"
            value={timing.middleware}
            total={timing.total}
            icon={Clock}
          />
          <TimingRow label="Fetch" value={timing.fetch} total={timing.total} icon={ArrowUpDown} />
          {timing.validation > 0 && (
            <TimingRow
              label="Validation"
              value={timing.validation}
              total={timing.total}
              icon={FileKey}
            />
          )}
        </Section>
      )}

      {/* Per-middleware comparison vs average */}
      <Section title="vs Average">
        {chain.steps.map((step) => {
          const avg = aggregateStats.find((s) => s.name === step.name);
          if (!avg) return null;
          const diff = step.duration - avg.avgDuration;
          const pct = avg.avgDuration > 0 ? (diff / avg.avgDuration) * 100 : 0;
          return (
            <ComparisonRow
              key={step.index}
              name={step.name}
              actual={step.duration}
              avg={avg.avgDuration}
              diffPct={pct}
            />
          );
        })}
      </Section>

      {/* Headers added by middleware */}
      {stepsWithHeaders.length > 0 && (
        <Section title="Headers Added">
          {stepsWithHeaders.map((step) => (
            <div key={step.index} className="space-y-1">
              <span className="mono-xs font-medium text-muted-foreground">{step.name}</span>
              {step.headersAdded!.map((h) => (
                <div key={h} className="mono-xs pl-3 text-foreground/80">
                  {h}
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
