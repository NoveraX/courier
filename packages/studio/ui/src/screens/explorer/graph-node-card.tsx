import { Folder, Server } from "lucide-react";

import { Dot } from "@/design/dot";
import { TONE_FILL, TONE_TEXT } from "@/design/tone";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import type { GraphNode } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";
import { methodClassOf } from "./method-class";

const SHAPE: Readonly<Record<GraphNode["kind"], string>> = {
  source: "rounded-dialog pl-2.5 shadow-[0_1px_0_rgb(0_0_0/0.04)]",
  group: "rounded-panel pl-2.5",
  endpoint: "rounded-[9px] pl-3",
};

interface GraphNodeCardProps {
  node: GraphNode;
  onHover: (id: string | undefined) => void;
  onOpen: (node: GraphNode) => void;
}

function Tile({ kind }: { kind: "source" | "group" }): React.ReactNode {
  const Icon = kind === "source" ? Server : Folder;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-card",
        kind === "source" ? "bg-syntax-type/12 text-syntax-type" : "bg-raised text-fg-subtle",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

/**
 * A node on the Explorer's graph: a source or a group with its icon, or an
 * endpoint with its method and path — each with its figure under the
 * colour metric, its health on its left edge and in its dot, which pulses
 * while it is active. Hovering or focusing it lights its branch.
 *
 * @param props - The node, and what hovering and opening it do
 * @returns The node's card
 * @example
 * ```tsx
 * <GraphNodeCard node={node} onHover={setHover} onOpen={open} />
 * ```
 */
export function GraphNodeCard(props: GraphNodeCardProps): React.ReactNode {
  const { node, onHover, onOpen } = props;
  const tone = LEVEL_META[node.level].tone;
  return (
    <button
      type="button"
      onClick={() => onOpen(node)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(undefined)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(undefined)}
      aria-label={`${node.key} · ${LEVEL_META[node.level].label} · ${node.value.text}`}
      aria-pressed={node.kind === "endpoint" ? node.selected : undefined}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      className={cn(
        "absolute flex cursor-pointer items-center gap-2.25 border bg-panel pr-2.5 text-left transition-[opacity,border-color,box-shadow] duration-150 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand",
        SHAPE[node.kind],
        node.selected
          ? "border-brand shadow-[0_0_0_3px_var(--color-brand-dim)]"
          : node.matched
            ? "border-brand/50"
            : "border-line",
        node.dim && "opacity-30",
      )}
    >
      <span
        className={cn("absolute top-2 bottom-2 -left-px w-0.5 rounded-[2px]", TONE_FILL[tone])}
      />
      {node.kind !== "endpoint" && <Tile kind={node.kind} />}
      {node.method && (
        <span
          className={cn(
            "w-10.5 shrink-0 font-mono text-micro font-semibold",
            methodClassOf(node.method),
          )}
        >
          {node.method}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate font-mono text-control",
            node.kind === "source" ? "font-semibold" : "font-medium",
          )}
        >
          {node.label}
        </span>
        {node.sub && (
          <span className="truncate font-mono text-meta text-fg-subtle">{node.sub}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-badge font-medium whitespace-nowrap",
          TONE_TEXT[node.value.tone],
        )}
      >
        {node.value.text}
      </span>
      <Dot tone={tone} pulse={node.active} className="size-1.75" />
    </button>
  );
}
