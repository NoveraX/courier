import { useState } from "react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { Tone } from "@/design/tone";
import { TONE_FILL, TONE_TEXT } from "@/design/tone";
import type { ExplorerModel } from "@/features/explorer/explorer-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import type { TopMetric } from "@/features/explorer/overview-model";
import { topEndpoints } from "@/features/explorer/overview-model";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EndpointName } from "./endpoint-name";
import { methodClassOf } from "./method-class";
import { OverviewCard } from "./overview-card";

const MODES: readonly SegmentedOption<TopMetric>[] = [
  { value: "latency", label: "Latency" },
  { value: "errors", label: "Errors" },
  { value: "traffic", label: "Traffic" },
];

function figureOf(by: TopMetric, value: number, slowMs: number): { text: string; tone: Tone } {
  if (by === "traffic") return { text: String(value), tone: "brand" };
  if (by === "errors") {
    return { text: `${value.toFixed(1)}%`, tone: value >= 20 ? "err" : value >= 5 ? "warn" : "ok" };
  }
  return {
    text: formatDuration(value),
    tone: value > slowMs * 2 ? "err" : value > slowMs ? "warn" : "ok",
  };
}

interface TopEndpointsProps {
  model: ExplorerModel;
  slowMs: number;
  onOpen: (key: string) => void;
}

/**
 * The seven endpoints that rank highest by p95, by error rate or by calls,
 * each with a bar against the top one; a click opens its panel.
 *
 * @param props - The model, the slow threshold, and what opens an endpoint
 * @returns The card
 * @example
 * ```tsx
 * <TopEndpoints model={model} slowMs={500} onOpen={(key) => set({ endpoint: key })} />
 * ```
 */
export function TopEndpoints({ model, slowMs, onOpen }: TopEndpointsProps): React.ReactNode {
  const [by, setBy] = useState<TopMetric>("latency");
  const top = topEndpoints(model, by);
  return (
    <OverviewCard
      title="Top endpoints"
      aside={
        <>
          <div className="flex-1" />
          <Segmented label="Rank by" options={MODES} value={by} onChange={setBy} quiet="subtle" />
        </>
      }
    >
      <div className="flex flex-col p-1.5">
        {top.length === 0 && (
          <p className="px-2.5 py-8 text-center text-control text-fg-subtle">No calls yet</p>
        )}
        {top.map(({ endpoint, value, share }, index) => {
          const method = methodLabelOf(endpoint);
          const figure = figureOf(by, value, slowMs);
          return (
            <button
              key={endpoint.key}
              type="button"
              onClick={() => onOpen(endpoint.key)}
              className="grid h-9.5 cursor-pointer grid-cols-[18px_minmax(0,1fr)_minmax(60px,110px)_64px] items-center gap-3 rounded-control px-2.5 text-left font-mono text-small hover:bg-raised focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="text-badge text-fg-subtle">{index + 1}</span>
              <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                <span
                  className={cn("w-10 shrink-0 text-micro font-semibold", methodClassOf(method))}
                >
                  {method}
                </span>
                <EndpointName {...endpoint} />
              </span>
              <span className="h-1.25 overflow-hidden rounded-[3px] bg-raised">
                <span
                  className={cn("block h-full rounded-[3px]", TONE_FILL[figure.tone])}
                  style={{ width: `${share * 100}%` }}
                />
              </span>
              <span className={cn("text-right tabular-nums", TONE_TEXT[figure.tone])}>
                {figure.text}
              </span>
            </button>
          );
        })}
      </div>
    </OverviewCard>
  );
}
