import type { CardActions, FlowNode } from "./flow-nodes";
import type { GraphLayout, GraphNode } from "./graph-types";

/** The flow's nodes for a layout, the ones that did not change kept as the objects they were. */
export type KeptPlacedNodes = (layout: GraphLayout, card: CardActions) => FlowNode[];

/* Everything a card shows, and where: two nodes that agree on it draw the same card. */
function signatureOf(node: GraphNode): string {
  const figures = node.figures.map((figure) => `${figure.label}=${figure.value}:${figure.tone}`);
  return [
    node.kind,
    node.key,
    node.x,
    node.y,
    node.width,
    node.height,
    node.label,
    node.sub ?? "",
    node.method ?? "",
    node.value.text,
    node.value.tone,
    node.level,
    node.active,
    node.dim,
    node.matched,
    node.selected,
    node.hovered,
    node.detail,
    node.fold ? `${node.fold.folded}/${node.fold.hidden}` : "",
    figures.join(","),
  ].join("\u0000");
}

/**
 * Keep each card the flow is handed as the object it was while what it
 * shows stays the same. The graph is laid out again as calls come in —
 * every half second under steady traffic — and each layout is a new set of
 * nodes; handed a new object, the flow measures and draws the card again,
 * and with a thousand endpoints on screen that kept the page busy. Now only
 * the cards whose figures, health or place changed are drawn again.
 *
 * @param placedNodesOf - Builds the headings and cards of a layout
 * @returns What builds them, reusing the cards that did not change
 * @example
 * ```ts
 * const [placed] = useState(() => keptPlacedNodes(placedNodesOf));
 * const nodes = useMemo(() => placed(layout, actions), [layout, actions]);
 * ```
 */
export function keptPlacedNodes(
  placedNodesOf: (layout: GraphLayout, card: CardActions) => FlowNode[],
): KeptPlacedNodes {
  let kept = new Map<string, { signature: string; card: CardActions; node: FlowNode }>();
  return (layout, card) => {
    const next = new Map<string, { signature: string; card: CardActions; node: FlowNode }>();
    const nodes = placedNodesOf(layout, card).map((node) => {
      if (node.type !== "card") return node;
      const signature = signatureOf(node.data.node);
      const before = kept.get(node.id);
      const same =
        before !== undefined &&
        before.signature === signature &&
        before.card.onHover === card.onHover &&
        before.card.onOpen === card.onOpen &&
        before.card.onFold === card.onFold;
      const shown = same ? before.node : node;
      next.set(node.id, { signature, card, node: shown });
      return shown;
    });
    kept = next;
    return nodes;
  };
}
