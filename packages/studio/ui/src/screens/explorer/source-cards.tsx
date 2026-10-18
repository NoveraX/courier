import { Server } from "lucide-react";
import { CardSection } from "@/design/card-section";
import { TONE_FILL, TONE_TEXT } from "@/design/tone";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import type { ExplorerModel, SourceNode } from "@/features/explorer/explorer-model";
import { successRate } from "@/features/explorer/overview-model";
import { cn } from "@/lib/utils";

function count(n: number, noun: string): React.ReactNode {
  return (
    <span>
      <span className="font-strong text-fg">{n}</span> {n === 1 ? noun : `${noun}s`}
    </span>
  );
}

function SourceCard({ source }: { source: SourceNode }): React.ReactNode {
  const tone = LEVEL_META[source.level].tone;
  const rate = successRate(source);
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-line bg-inset p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-card bg-syntax-type/12 text-syntax-type">
          <Server aria-hidden="true" className="size-3.25" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate font-mono text-control font-medium">{source.name}</span>
          <span className="truncate font-mono text-meta text-fg-subtle">
            {source.baseURL.replace(/^https?:\/\//, "")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-label text-fg-subtle">
        {count(source.groups.length, "group")}
        {count(source.endpoints.length, "endpoint")}
        <div className="flex-1" />
        <span className={cn("font-mono tabular-nums", TONE_TEXT[tone])}>
          {rate === null ? "—" : `${rate}%`}
        </span>
      </div>
      <div className="h-0.75 overflow-hidden rounded-[2px] bg-raised">
        <span className={cn("block h-full", TONE_FILL[tone])} style={{ width: `${rate ?? 0}%` }} />
      </div>
    </div>
  );
}

/**
 * A card per source: where it points, its groups and endpoints, and the
 * share of its requests that succeeded, coloured by its health.
 *
 * @param props - The model
 * @returns The card of cards
 * @example
 * ```tsx
 * <SourceCards model={model} />
 * ```
 */
export function SourceCards({ model }: { model: ExplorerModel }): React.ReactNode {
  return (
    <CardSection
      title="Sources"
      aside={
        <span className="inline-flex h-4.25 min-w-5 items-center justify-center rounded-full bg-raised px-1.5 text-meta text-fg-subtle tabular-nums">
          {model.sources.length}
        </span>
      }
    >
      <div className="grid max-h-105 grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-2 overflow-auto p-3">
        {model.sources.map((source) => (
          <SourceCard key={source.name} source={source} />
        ))}
      </div>
    </CardSection>
  );
}
