import type { Node } from "@xyflow/react";

import type { Pulse } from "./call-pulses";
import type { GraphEdge, GraphLayout, GraphNode } from "./graph-types";

/** What hovering, opening and folding a card on the graph do. */
export interface CardActions {
  onHover: (id: string | undefined) => void;
  onOpen: (node: GraphNode) => void;
  /** Folds or unfolds a group, by key; a graph without it folds nothing. */
  onFold?: ((key: string) => void) | undefined;
}

/** What a card on the graph is handed: its node, and what hovering and opening it do. */
export interface CardData extends CardActions, Record<string, unknown> {
  node: GraphNode;
}

/** A card on the graph. */
export type CardNode = Node<CardData, "card">;
/** A column's heading. */
export type HeadingNode = Node<{ label: string }, "heading">;
/** The curves under every card. */
/** The calls running on the graph, and what one that ran its way calls. */
export interface RunningCalls {
  pulses: readonly Pulse[];
  onPulseDone: (id: string) => void;
}

export interface WiresData extends RunningCalls, Record<string, unknown> {
  edges: readonly GraphEdge[];
  width: number;
  height: number;
}

export type WiresNode = Node<WiresData, "wires">;
/** A node of the graph's flow. */
export type FlowNode = CardNode | HeadingNode | WiresNode;

const FIXED = { draggable: false, selectable: false, focusable: false } as const;

const NO_CALLS: RunningCalls = { pulses: [], onPulseDone: () => {} };

/**
 * The graph's layout as flow nodes, in the layout's own coordinates: the
 * curves first and lowest, the columns' headings, then a card a node —
 * none dragged, selected or focused by the flow; a card is a button itself.
 *
 * @param layout - The graph's layout
 * @param card - What hovering and opening a card do
 * @param calls - The calls running along the curves, none unless given
 * @returns The nodes
 * @example
 * ```ts
 * flowNodesOf(layout, { onHover: setHover, onOpen: open }).length; // layout.nodes.length + 4
 * ```
 */
export function flowNodesOf(
  layout: GraphLayout,
  card: CardActions,
  calls: RunningCalls = NO_CALLS,
): FlowNode[] {
  return [wiresNodeOf(layout, calls), ...placedNodesOf(layout, card)];
}

/**
 * The curves under every card, with the calls running along them: the one
 * node a running call changes. The cards are built apart from it, so a call
 * that starts or ends leaves every card the object it was, and a graph of a
 * thousand endpoints is not handed to the flow anew for each call.
 *
 * @param layout - The graph's layout
 * @param calls - The calls running along the curves
 * @returns The curves' node
 * @example
 * ```ts
 * const wires = useMemo(() => wiresNodeOf(layout, calls), [layout, calls]);
 * ```
 */
export function wiresNodeOf(layout: GraphLayout, calls: RunningCalls = NO_CALLS): WiresNode {
  return {
    id: "wires",
    type: "wires",
    position: { x: 0, y: 0 },
    data: { edges: layout.edges, width: layout.width, height: layout.height, ...calls },
    zIndex: 0,
    style: { pointerEvents: "none" },
    ...FIXED,
  };
}

/**
 * The columns' headings and a card a node, where the layout places them.
 *
 * @param layout - The graph's layout
 * @param card - What hovering and opening a card do
 * @returns The headings, then the cards
 * @example
 * ```ts
 * const placed = useMemo(() => placedNodesOf(layout, actions), [layout, actions]);
 * ```
 */
export function placedNodesOf(layout: GraphLayout, card: CardActions): FlowNode[] {
  const headings = layout.columns.map(
    (column, index): HeadingNode => ({
      id: `column:${index}`,
      type: "heading",
      position: { x: column.x, y: 16 },
      data: { label: column.label },
      zIndex: 1,
      ...FIXED,
    }),
  );
  const cards = layout.nodes.map(
    (node): CardNode => ({
      id: node.id,
      type: "card",
      position: { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      data: { node, ...card },
      /* The hovered card rises, so its figures show over the cards beside it. */
      zIndex: node.hovered ? 3 : 2,
      /* The flow lets the pointer through a node it neither drags nor
         selects; the card is a button, hovered and clicked itself. */
      style: { pointerEvents: "all" },
      ...FIXED,
    }),
  );
  return [...headings, ...cards];
}
