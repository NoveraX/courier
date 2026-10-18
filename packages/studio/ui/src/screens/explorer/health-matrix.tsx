import { CardSection } from "@/design/card-section";
import { type HealthLevel, LEVEL_META } from "@/features/explorer/endpoint-metrics";
import type { ExplorerModel, GroupNode } from "@/features/explorer/explorer-model";
import { callsAndRequests } from "@/features/requests/own-requests";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/* A name tells its health by its colour: trouble and silence colour it, health leaves it as it is. */
const LEVEL_TEXT: Readonly<Record<HealthLevel, string>> = {
  healthy: "",
  degraded: "text-warn",
  critical: "text-err",
  idle: "text-fg-subtle",
};

function tipOf(group: GroupNode): string {
  const { calls, requests, errorRate, p95 } = group.metrics;
  const latency = p95 === null ? "—" : formatDuration(p95);
  return `${group.key} · ${callsAndRequests(calls, requests)} · ${errorRate.toFixed(1)}% errors · p95 ${latency}`;
}

interface HealthMatrixProps {
  model: ExplorerModel;
  /** Open the Endpoints list narrowed to a group, by its key. */
  onGroup: (key: string) => void;
}

/**
 * Every group of every source as a chip coloured by its health with its
 * calls — a critical group on a red tint — each opening the Endpoints list
 * narrowed to it. On a phone a source's name sits over its groups.
 *
 * @param props - The model, and what opens a group
 * @returns The card
 * @example
 * ```tsx
 * <HealthMatrix model={model} onGroup={(key) => set({ q: `${key}.` }, "/explorer/endpoints")} />
 * ```
 */
export function HealthMatrix({ model, onGroup }: HealthMatrixProps): React.ReactNode {
  const sources = model.sources.filter((source) => source.groups.length > 0);
  return (
    <CardSection
      title="Health matrix"
      aside={<span className="text-label text-fg-subtle">groups by source</span>}
    >
      <div className="flex max-h-90 flex-col overflow-auto px-2 pt-1.5 pb-2.5">
        {sources.map((source) => (
          <div
            key={source.name}
            className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3 rounded-card p-2 hover:bg-bg-subtle max-sm:grid-cols-1 max-sm:gap-1.5"
          >
            <span
              className={cn(
                "min-w-0 truncate pt-1 font-mono text-small max-sm:pt-0",
                LEVEL_TEXT[source.level],
              )}
            >
              {source.name}
              <span className="sr-only">{`, ${LEVEL_META[source.level].label}`}</span>
            </span>
            <div className="flex flex-wrap gap-1.25">
              {source.groups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  title={tipOf(group)}
                  onClick={() => onGroup(group.key)}
                  className={cn(
                    "flex h-6 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-2 text-label text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9 pointer-coarse:px-2.5",
                    group.level === "critical" ? "bg-err-tint" : "bg-inset",
                    LEVEL_TEXT[group.level],
                  )}
                >
                  {group.path}
                  <span className="sr-only">{`, ${LEVEL_META[group.level].label}`}</span>
                  <span className="font-mono text-meta text-fg-subtle">
                    {group.metrics.calls || ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}
