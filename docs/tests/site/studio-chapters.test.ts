/**
 * The Studio page's chapter visuals run on clocks. Each must loop, stay
 * the same on the server and in the browser, and show what the view it
 * stands for would: a lit edge with its two nodes, chaos failing about as
 * often as its preset says, and an audit re-checked rule by rule. Each
 * chapter opens its view in the live demo.
 */
import { describe, expect, it } from "vitest"

import {
  auditFrame,
  auditScore,
  SESSION_TICKS,
  scoreLook,
} from "@/site/studio-landing/chapters/audit-model"
import { CHAPTERS } from "@/site/studio-landing/chapters/chapters"
import {
  edgePath,
  GRAPH_EDGES,
  graphLayoutFor,
  hotEdge,
  NARROW_BELOW,
  NARROW_GRAPH,
  WIDE_GRAPH,
} from "@/site/studio-landing/chapters/graph-model"
import { callStrip, outcomeOf, presetAt } from "@/site/studio-landing/chapters/mock-model"

describe("the Explorer graph", () => {
  it("draws each edge from its parent's right side to its child's left", () => {
    expect(edgePath([0, 2])).toBe("M150 90 C175 90, 175 55, 200 55")
  })

  it("draws its columns closer in a phone's frame, so that its labels stay readable", () => {
    expect(graphLayoutFor(343)).toBe(NARROW_GRAPH)
    expect(graphLayoutFor(NARROW_BELOW)).toBe(WIDE_GRAPH)
    expect(graphLayoutFor(0)).toBe(WIDE_GRAPH)
    expect(edgePath([0, 2], NARROW_GRAPH)).toBe("M92 90 C105 90, 105 55, 118 55")
  })

  it("keeps every column inside the graph and clear of the next, wide or narrow", () => {
    for (const { x, nodeWidth, width } of [WIDE_GRAPH, NARROW_GRAPH]) {
      expect(x.source + nodeWidth.source).toBeLessThan(x.group)
      expect(x.group + nodeWidth.group).toBeLessThan(x.endpoint)
      expect(x.endpoint + nodeWidth.endpoint).toBeLessThanOrEqual(width)
    }
  })

  it("lights every edge in turn", () => {
    const lit = new Set(Array.from({ length: GRAPH_EDGES.length }, (_, step) => hotEdge(step)))

    expect(lit.size).toBe(GRAPH_EDGES.length)
  })
})

describe("chaos", () => {
  it("steps through the presets, three steps each", () => {
    expect([0, 3, 6, 9, 12, 15, 18].map(presetAt)).toEqual([2, 3, 2, 1, 0, 1, 2])
  })

  it("fails calls about as often as the preset says", () => {
    const failed = (preset: number) =>
      Array.from({ length: 2000 }, (_, call) => outcomeOf(call, preset)).filter(
        (o) => o === "failed"
      ).length / 2000

    expect(failed(0)).toBeLessThan(0.05)
    expect(failed(2)).toBeGreaterThan(0.25)
    expect(failed(3)).toBeGreaterThan(0.85)
  })

  it("shifts the strip by one call a step", () => {
    expect(callStrip(1, 2).slice(0, 47)).toEqual(callStrip(0, 2).slice(1))
    expect(callStrip(5, 2)[0]?.n).toBe(5)
  })
})

describe("the audit", () => {
  it("starts at rest on the first session, then re-checks one rule a tick", () => {
    const frames = Array.from({ length: SESSION_TICKS }, (_, tick) => auditFrame(tick))
    const checks = frames.map((f) => f.checking).filter((at) => at >= 0)

    expect(frames[0]).toEqual({ severities: ["error", "error", "warning", "pass"], checking: -1 })
    expect(checks).toEqual([0, 1, 2, 3])
    expect(frames.at(-1)?.severities).toEqual(["error", "pass", "warning", "pass"])
  })

  it("scores a session and names the score", () => {
    expect(auditScore(["error", "error", "warning", "pass"])).toBe(88)
    expect(scoreLook(88)).toEqual({ label: "Good", tone: "warn" })
    expect(scoreLook(100).label).toBe("Excellent")
  })
})

describe("the chapters' links", () => {
  it("open each chapter's view in the live demo", () => {
    expect(CHAPTERS.map((chapter) => [chapter.cta.label, chapter.cta.href])).toEqual([
      ["Open Timeline", "https://demo.courier.noverax.cloud/timeline"],
      ["Open Explorer", "https://demo.courier.noverax.cloud/explorer"],
      ["Open Mocks", "https://demo.courier.noverax.cloud/mocks"],
      ["Open Audit", "https://demo.courier.noverax.cloud/audit"],
    ])
  })
})
