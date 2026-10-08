import { Link } from "@tanstack/react-router";
import { Activity, Play, X } from "lucide-react";
import { useState } from "react";

import { Reveal } from "@/design/reveal";
import { SheetFrame } from "@/design/sheet-frame";
import { TONE_TEXT } from "@/design/tone";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import { cn } from "@/lib/utils";
import { EndpointCalls } from "./endpoint-calls";
import { EndpointContract } from "./endpoint-contract";
import { EndpointDefinition } from "./endpoint-definition";
import { EndpointFigures } from "./endpoint-figures";
import { EndpointLatency } from "./endpoint-latency";
import { EndpointName } from "./endpoint-name";
import { EndpointTrafficOnly } from "./endpoint-traffic-only";
import { methodChipOf } from "./method-class";

const ACTION =
  "flex h-8 flex-1 items-center justify-center gap-1.75 rounded-card text-control focus-visible:outline-2 focus-visible:outline-brand";

interface EndpointSheetProps {
  endpoint: EndpointNode;
  now: number;
  slowMs: number;
  onClose: () => void;
  onOpenCall: (id: string) => void;
}

/**
 * An endpoint's panel: its method, health, name and URL, four figures, the
 * way to its calls in the Timeline and to the Playground, its latency
 * chart, its definition, its contract against its real answers and its
 * newest calls — arriving one after another
 * as the sheet springs in, as the inspector's parts do.
 *
 * @param props - The endpoint, the time, the slow threshold, and what closes the panel and opens a call
 * @returns The panel
 * @example
 * ```tsx
 * <EndpointSheet endpoint={endpoint} now={now} slowMs={500} onClose={close} onOpenCall={open} />
 * ```
 */
export function EndpointSheet(props: EndpointSheetProps): React.ReactNode {
  const { endpoint: e, now, slowMs, onClose, onOpenCall } = props;
  const method = methodLabelOf(e);
  const level = LEVEL_META[e.level];
  const [opening, setOpening] = useState(true);
  return (
    <SheetFrame
      label="Endpoint"
      width="w-[min(440px,calc(100vw-16px))]"
      layer="panel"
      onShown={() => setOpening(false)}
    >
      <div className="flex shrink-0 flex-col gap-3.5 border-b border-line pt-4 pr-3.5 pb-4 pl-4.5">
        <Reveal step={0} play={opening} className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.75">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-5 items-center rounded-[5px] px-1.5 font-mono text-meta font-semibold",
                  methodChipOf(method),
                )}
              >
                {method}
              </span>
              <span className="text-label text-fg-subtle">Endpoint</span>
              <span className={cn("flex items-center gap-1.25 text-label", TONE_TEXT[level.tone])}>
                {level.label}
              </span>
            </div>
            <h2 className="flex min-w-0 font-mono text-heading font-medium tracking-[-0.015em]">
              <EndpointName {...e} />
            </h2>
            <span className="truncate font-mono text-label text-fg-subtle">{e.url}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close · Esc"
            aria-label="Close"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X aria-hidden="true" className="size-3.75" />
          </button>
        </Reveal>
        <Reveal step={1} play={opening}>
          <EndpointFigures endpoint={e} slowMs={slowMs} />
        </Reveal>
        <Reveal step={2} play={opening} className="flex gap-2">
          <Link
            to="/timeline"
            search={{ q: e.key }}
            className={cn(
              ACTION,
              "border border-line bg-panel-subtle font-strong text-fg hover:border-line-strong",
            )}
          >
            <Activity aria-hidden="true" className="size-3.25" />
            View in Timeline
          </Link>
          <Link
            to="/playground"
            search={{ endpoint: e.key }}
            className={cn(ACTION, "bg-fg font-semibold text-bg hover:bg-fg/90")}
          >
            <Play aria-hidden="true" className="size-3" />
            Open in Playground
          </Link>
        </Reveal>
      </div>
      <Reveal
        step={3}
        play={opening}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4.5 pt-4.5 pb-7"
      >
        <EndpointLatency endpoint={e} slowMs={slowMs} />
        <EndpointTrafficOnly endpoint={e} />
        <EndpointDefinition endpoint={e} now={now} />
        <EndpointContract endpoint={e} now={now} />
        <EndpointCalls endpoint={e} slowMs={slowMs} onOpen={onOpenCall} />
      </Reveal>
    </SheetFrame>
  );
}
