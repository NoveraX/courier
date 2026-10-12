"use client"

import { Dot, Folder, Server } from "lucide-react"

import { cn } from "@/site/cn"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { useElementWidth } from "@/site/studio-landing/use-element-width"
import { useSeen } from "@/site/studio-landing/use-seen"
import { GraphEdges } from "./graph-edges"
import type { GraphNode, Health } from "./graph-model"
import { GRAPH_EDGES, GRAPH_NODES, graphLayoutFor, hotEdge } from "./graph-model"
import { stagger } from "./stagger"
import { VizFrame } from "./viz-frame"

const HEALTH: Readonly<Record<Health, string>> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  idle: "bg-fg-subtle",
}
const ENTER = { source: 0, group: 2, endpoint: 5 } as const

function iconOf(node: GraphNode) {
  if (node.kind === "source") return <Server aria-hidden="true" className="size-3 text-tone-teal" />
  if (node.kind === "group") return <Folder aria-hidden="true" className="size-3 text-fg-subtle" />
  const method = node.label.split(" ")[0]
  const tone =
    method === "PATCH"
      ? "text-tone-amber"
      : method === "POST"
        ? "text-tone-green"
        : "text-tone-blue"
  return <Dot aria-hidden="true" className={cn("size-3", tone)} strokeWidth={6} />
}

/**
 * The Explorer's map of an API: sources, their groups and their endpoints,
 * joined by edges that draw themselves in, with calls flowing along them
 * and one path lit at a time — red where an endpoint is failing. On a
 * phone its columns draw closer, so that its labels stay readable.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <GraphViz />
 * ```
 */
export function GraphViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  const [boxRef, width] = useElementWidth<HTMLDivElement>()
  const still = useReducedMotion()
  const step = useTicker(seen && !still, 1600)
  const layout = graphLayoutFor(width)
  const scale = Math.min(1.25, (width || layout.width) / layout.width)
  const size = { width: layout.width, height: layout.height }
  const left = Math.max(0, Math.round((width - layout.width * scale) / 2))
  const lit = GRAPH_EDGES[hotEdge(step)] ?? [0, 0]
  const litTone = GRAPH_NODES[lit[1]]?.health === "err" ? "err" : "brand"
  return (
    <VizFrame name="explore" frameRef={ref} seen={seen}>
      <div
        ref={boxRef}
        role="img"
        aria-label="A graph of two sources, their groups and their endpoints, with traffic flowing along it"
        className="relative overflow-hidden bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.2px)] bg-size-[18px_18px]"
        style={{ height: `${Math.round(layout.height * scale)}px` }}
      >
        <div
          className="absolute top-0 origin-top-left"
          style={{ ...size, left, transform: `scale(${scale})` }}
        >
          <GraphEdges layout={layout} />
          {GRAPH_NODES.map((node, at) => {
            const hot = lit.includes(at)
            return (
              <div
                key={`${node.label}-${node.y}`}
                data-a="pop"
                style={{
                  ...stagger(ENTER[node.kind] + (at % 3)),
                  left: layout.x[node.kind],
                  top: node.y,
                  width: layout.nodeWidth[node.kind],
                }}
                className={cn(
                  "absolute -mt-4 flex h-8 items-center overflow-hidden rounded-[9px] border bg-panel font-mono text-[11px] whitespace-nowrap transition-[border-color,box-shadow] duration-400",
                  layout.tight ? "gap-1 px-1.5" : "gap-1.75 px-2.25",
                  hot &&
                    litTone === "err" &&
                    "border-err shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-err)_14%,transparent),0_0_20px_color-mix(in_srgb,var(--color-err)_22%,transparent)]",
                  hot &&
                    litTone === "brand" &&
                    "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_14%,transparent),0_0_20px_color-mix(in_srgb,var(--color-brand)_22%,transparent)]",
                  !hot && "border-line"
                )}
              >
                {iconOf(node)}
                <span className="flex-1 truncate">{node.label}</span>
                <span className="relative size-1.5 shrink-0">
                  <span
                    data-a="ping"
                    style={stagger(at)}
                    className={cn("absolute inset-0 rounded-full", HEALTH[node.health])}
                  />
                  <span className={cn("absolute inset-0 rounded-full", HEALTH[node.health])} />
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </VizFrame>
  )
}
