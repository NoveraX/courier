/**
 * @vitest-environment jsdom
 *
 * The Explorer's graph on a canvas that pans and zooms: its layout as flow
 * nodes in the layout's own coordinates — the curves lowest and never in
 * the way, the headings, a card a node — controls to zoom and fit, and a
 * minimap once the graph outgrows a screenful.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { flowNodesOf, placedNodesOf, wiresNodeOf } from "@/features/explorer/flow-nodes";
import type { GraphLayout, GraphNode } from "@/features/explorer/graph-types";
import { keptPlacedNodes } from "@/features/explorer/kept-cards";
import { GraphFlow } from "@/screens/explorer/graph-flow";

function node(index: number): GraphNode {
  return {
    id: `e:api.users.n${index}`,
    kind: "endpoint",
    key: `api.users.n${index}`,
    x: 500,
    y: 52 + index * 48,
    width: 300,
    height: 40,
    label: `n${index}`,
    sub: "/users",
    method: "GET",
    value: { text: "12ms", tone: "normal" },
    level: "healthy",
    active: false,
    dim: false,
    matched: false,
    selected: false,
    hovered: false,
    detail: `GET /users/n${index}`,
    figures: [],
  };
}

function layoutOf(count: number): GraphLayout {
  return {
    nodes: Array.from({ length: count }, (_, i) => node(i)),
    edges: [
      {
        id: "g-e",
        path: "M 0 0 C 10 0 10 10 20 10",
        tone: "plain",
        opacity: 1,
      },
    ],
    branches: new Map(),
    width: 804,
    height: 52 + count * 48 + 12,
    columns: [
      { x: 0, label: "Sources · 1" },
      { x: 250, label: "Groups · 1" },
      { x: 500, label: `Endpoints · ${count}` },
    ],
  };
}

/* jsdom has no ResizeObserver; the canvas measures its frame with one. */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => cleanup());

describe("the graph as flow nodes", () => {
  it("puts the curves lowest and out of the way, then the headings, then a card a node where the layout has it", () => {
    const actions = { onHover: vi.fn(), onOpen: vi.fn() };

    const nodes = flowNodesOf(layoutOf(2), actions);

    expect(nodes.map((n) => [n.type, n.zIndex])).toEqual([
      ["wires", 0],
      ["heading", 1],
      ["heading", 1],
      ["heading", 1],
      ["card", 2],
      ["card", 2],
    ]);
    expect(nodes[0]?.style).toEqual({ pointerEvents: "none" });
    expect(nodes.at(-1)).toMatchObject({
      id: "e:api.users.n1",
      position: { x: 500, y: 100 },
      width: 300,
      height: 40,
    });
    expect(nodes.every((n) => !n.draggable && !n.selectable && !n.focusable)).toBe(true);
  });

  it("lets a card take the pointer, which the flow withholds from a node it neither drags nor selects", () => {
    const nodes = flowNodesOf(layoutOf(2), { onHover: vi.fn(), onOpen: vi.fn() });

    const cards = nodes.filter((n) => n.type === "card");

    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card.style).toEqual({ pointerEvents: "all" });
  });
});

describe("the graph laid out again as calls come in", () => {
  it("keeps every card as the object it was while what it shows stays the same", () => {
    const actions = { onHover: vi.fn(), onOpen: vi.fn() };
    const placed = keptPlacedNodes(placedNodesOf);

    const first = placed(layoutOf(3), actions);
    const changed = layoutOf(3);
    changed.nodes[1] = { ...node(1), value: { text: "40ms", tone: "warn" } };
    const second = placed(changed, actions);

    const cards = (nodes: typeof first) => nodes.filter((n) => n.type === "card");
    expect(cards(second)[0]).toBe(cards(first)[0]);
    expect(cards(second)[1]).not.toBe(cards(first)[1]);
    expect(cards(second)[2]).toBe(cards(first)[2]);
  });

  it("draws every card again once what hovering or opening one does is another function", () => {
    const placed = keptPlacedNodes(placedNodesOf);

    const first = placed(layoutOf(2), { onHover: vi.fn(), onOpen: vi.fn() });
    const second = placed(layoutOf(2), { onHover: vi.fn(), onOpen: vi.fn() });

    expect(second.filter((n) => n.type === "card").some((card, at) => card === first[at])).toBe(
      false,
    );
  });

  it("runs the calls on the curves' node alone, leaving the cards as they were", () => {
    const layout = layoutOf(2);
    const before = wiresNodeOf(layout, { pulses: [], onPulseDone: vi.fn() });
    const after = wiresNodeOf(layout, {
      pulses: [{ id: "p1", path: "M 0 0 L 10 10", duration: 400, tone: "ok" }] as never,
      onPulseDone: vi.fn(),
    });

    expect(after).not.toBe(before);
    expect(after.data.edges).toBe(before.data.edges);
  });
});

describe("the graph's canvas", () => {
  it("zooms in and out and fits the graph in view", () => {
    render(
      <GraphFlow
        calls={{ pulses: [], onPulseDone: vi.fn() }}
        layout={layoutOf(3)}
        onHover={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    for (const name of ["Zoom in", "Zoom out", "Fit the graph"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(document.querySelector(".react-flow__minimap")).toBeNull();
  });

  it("shows where the view is on a graph larger than a screenful", () => {
    render(
      <GraphFlow
        calls={{ pulses: [], onPulseDone: vi.fn() }}
        layout={layoutOf(30)}
        onHover={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    expect(document.querySelector(".react-flow__minimap")).not.toBeNull();
  });
});
